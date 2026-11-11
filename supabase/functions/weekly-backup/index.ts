// Supabase Edge Function: weekly-backup
// Sao lưu tự động hằng tuần ưu tiên định dạng nén JSON.GZ (.json.gz),
// KHÔNG sao chép binary ảnh (chỉ lưu dữ liệu database + metadata ảnh + storagePath + SHA-256 checksum),
// lưu vào private bucket `app-backups`, ghi bảng `backups` và chỉ giữ tối đa 8 bản sao lưu tự động gần nhất.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(rec).sort()) {
    if (rec[k] !== undefined) out[k] = canonicalizeValue(rec[k]);
  }
  return out;
}

async function gzipCompressUtf8(jsonText: string): Promise<{ bytes: Uint8Array; format: "json_gzip" | "json"; ext: string; mime: string }> {
  const utf8 = new TextEncoder().encode(jsonText);
  if (typeof CompressionStream === "function") {
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    await writer.write(utf8);
    await writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      format: "json_gzip",
      ext: "json.gz",
      mime: "application/gzip"
    };
  }
  return {
    bytes: utf8,
    format: "json",
    ext: "json",
    mime: "application/json;charset=utf-8"
  };
}

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase environment variables" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: settingsRows, error: settingsErr } = await admin
      .from("settings")
      .select("owner_id")
      .eq("auto_backup_enabled", true);

    if (settingsErr) throw settingsErr;

    const results: Array<{ ownerId: string; backupId: string; format: string; status: string }> = [];

    for (const row of settingsRows ?? []) {
      const ownerId = row.owner_id as string;
      const backupId = crypto.randomUUID();
      const startedAt = new Date().toISOString();

      try {
        const [classes, students, books, transactions, transactionImages, auditLogs, settings] = await Promise.all([
          admin.from("classes").select("*").eq("owner_id", ownerId),
          admin.from("students").select("*").eq("owner_id", ownerId),
          admin.from("books").select("*").eq("owner_id", ownerId),
          admin.from("transactions").select("*").eq("owner_id", ownerId),
          admin.from("transaction_images").select(
            "id, transaction_id, bucket_name, storage_path, original_file_name, mime_type, file_size_bytes, checksum, created_at, owner_id"
          ).eq("owner_id", ownerId),
          admin.from("audit_logs").select("*").eq("owner_id", ownerId),
          admin.from("settings").select(
            "id, owner_id, app_name, currency, timezone, auto_backup_enabled, auto_backup_cron_configured, migration_completed, migrated_at, updated_at"
          ).eq("owner_id", ownerId)
        ]);

        // Chỉ lưu metadata ảnh và storagePath, tuyệt đối không sao chép binary ảnh hay signed URL
        const sanitizedImages = (transactionImages.data ?? []).map((im: Record<string, unknown>) => ({
          id: String(im.id ?? ""),
          transactionId: String(im.transaction_id ?? ""),
          bucket: "transaction-images",
          storagePath: String(im.storage_path ?? "").split("?")[0],
          originalFileName: String(im.original_file_name ?? "receipt.jpg"),
          mimeType: String(im.mime_type ?? "image/jpeg"),
          size: Number(im.file_size_bytes ?? 0),
          checksum: String(im.checksum ?? ""),
          createdAt: String(im.created_at ?? startedAt),
          createdBy: String(im.owner_id ?? ownerId)
        }));

        const recordCounts = {
          classes: classes.data?.length ?? 0,
          students: students.data?.length ?? 0,
          books: books.data?.length ?? 0,
          transactions: transactions.data?.length ?? 0,
          transactionImages: sanitizedImages.length,
          auditLogs: auditLogs.data?.length ?? 0,
          settings: settings.data?.length ?? 0
        };

        const metadataWithoutChecksum = {
          schemaVersion: "2.1.0",
          appVersion: "2.1.0-production",
          backupVersion: "1.0.0",
          createdAt: startedAt,
          createdBy: ownerId,
          format: "json_gzip",
          recordCounts
        };

        const canonicalStr = JSON.stringify(
          canonicalizeValue({
            metadata: metadataWithoutChecksum,
            classes: classes.data ?? [],
            students: students.data ?? [],
            books: books.data ?? [],
            transactions: transactions.data ?? [],
            transactionImages: sanitizedImages,
            auditLogs: auditLogs.data ?? [],
            settings: settings.data ?? []
          })
        );

        const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalStr));
        const checksum = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

        const fullPayload = JSON.stringify(
          {
            metadata: {
              ...metadataWithoutChecksum,
              checksum
            },
            classes: classes.data ?? [],
            students: students.data ?? [],
            books: books.data ?? [],
            transactions: transactions.data ?? [],
            transactionImages: sanitizedImages,
            auditLogs: auditLogs.data ?? [],
            settings: settings.data ?? []
          },
          null,
          2
        );

        const compressed = await gzipCompressUtf8(fullPayload);
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, "0");
        const filePath = `${ownerId}/${year}/${month}/${backupId}.${compressed.ext}`;

        const { error: uploadErr } = await admin.storage
          .from("app-backups")
          .upload(filePath, compressed.bytes, {
            contentType: compressed.mime,
            upsert: false
          });

        if (uploadErr) throw uploadErr;

        const completedAt = new Date().toISOString();
        const { error: insertErr } = await admin.from("backups").insert({
          id: backupId,
          owner_id: ownerId,
          user_id: ownerId,
          backup_type: "automatic",
          format: compressed.format,
          schema_version: "2.1.0",
          app_version: "2.1.0-production",
          status: "completed",
          started_at: startedAt,
          completed_at: completedAt,
          file_path: filePath,
          file_size: compressed.bytes.byteLength,
          checksum,
          record_counts: recordCounts,
          error_message: "",
          created_at: completedAt
        });

        if (insertErr) throw insertErr;

        // Giữ tối đa 8 bản sao lưu tự động gần nhất, chỉ xóa bản tự động cũ sau khi bản mới đã thành công
        const { data: oldBackups } = await admin
          .from("backups")
          .select("id, file_path")
          .eq("owner_id", ownerId)
          .eq("backup_type", "automatic")
          .eq("status", "completed")
          .order("created_at", { ascending: false });

        if (oldBackups && oldBackups.length > 8) {
          const toDelete = oldBackups.slice(8);
          const paths = toDelete.map((b: { file_path: string }) => b.file_path).filter(Boolean);
          if (paths.length > 0) {
            await admin.storage.from("app-backups").remove(paths);
          }
          await admin.from("backups").delete().in("id", toDelete.map((b: { id: string }) => b.id));
        }

        results.push({ ownerId, backupId, format: compressed.format, status: "completed" });
      } catch (innerErr) {
        const failedAt = new Date().toISOString();
        await admin.from("backups").insert({
          id: backupId,
          owner_id: ownerId,
          user_id: ownerId,
          backup_type: "automatic",
          format: "json_gzip",
          schema_version: "2.1.0",
          app_version: "2.1.0-production",
          status: "failed",
          started_at: startedAt,
          completed_at: failedAt,
          file_path: "",
          file_size: 0,
          checksum: "",
          record_counts: {},
          error_message: String(innerErr),
          created_at: failedAt
        });
        results.push({ ownerId, backupId, format: "json_gzip", status: "failed" });
      }
    }

    return new Response(JSON.stringify({ ok: true, results, authHeaderPresent: Boolean(authHeader) }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
