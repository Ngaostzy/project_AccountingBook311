// Supabase Edge Function: weekly-backup
// Tự động đóng gói dữ liệu 7 bảng thành gói sao lưu, lưu vào private bucket `app-backups`,
// ghi bảng `backups` và chỉ giữ tối đa 8 bản sao lưu tự động gần nhất theo `owner_id`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    const results: Array<{ ownerId: string; backupId: string; status: string }> = [];

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
          admin.from("transaction_images").select("*").eq("owner_id", ownerId),
          admin.from("audit_logs").select("*").eq("owner_id", ownerId),
          admin.from("settings").select("*").eq("owner_id", ownerId)
        ]);

        const recordCounts = {
          classes: classes.data?.length ?? 0,
          students: students.data?.length ?? 0,
          books: books.data?.length ?? 0,
          transactions: transactions.data?.length ?? 0,
          transaction_images: transactionImages.data?.length ?? 0,
          audit_logs: auditLogs.data?.length ?? 0,
          settings: settings.data?.length ?? 0
        };

        const bundlePayload = JSON.stringify({
          metadata: {
            schema_version: "2.0.0",
            app_version: "2.0.0-production",
            backup_at: new Date().toISOString(),
            owner_id: ownerId,
            record_counts: recordCounts
          },
          classes: classes.data ?? [],
          students: students.data ?? [],
          books: books.data ?? [],
          transactions: transactions.data ?? [],
          transaction_images: transactionImages.data ?? [],
          audit_logs: auditLogs.data ?? [],
          settings: settings.data ?? []
        });

        const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bundlePayload));
        const checksum = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, "0");
        const filePath = `${ownerId}/${year}/${month}/${backupId}.zip`;

        const { error: uploadErr } = await admin.storage
          .from("app-backups")
          .upload(filePath, new TextEncoder().encode(bundlePayload), {
            contentType: "application/zip",
            upsert: false
          });

        if (uploadErr) throw uploadErr;

        await admin.from("backups").insert({
          id: backupId,
          owner_id: ownerId,
          backup_type: "auto_weekly",
          status: "completed",
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          record_counts: recordCounts,
          file_path: filePath,
          checksum
        });

        // Giữ tối đa 8 bản sao lưu tự động gần nhất, chỉ xóa bản cũ sau khi bản mới đã thành công
        const { data: oldBackups } = await admin
          .from("backups")
          .select("id, file_path")
          .eq("owner_id", ownerId)
          .eq("backup_type", "auto_weekly")
          .eq("status", "completed")
          .order("created_at", { ascending: false });

        if (oldBackups && oldBackups.length > 8) {
          const toDelete = oldBackups.slice(8);
          const paths = toDelete.map(b => b.file_path).filter(Boolean);
          if (paths.length > 0) {
            await admin.storage.from("app-backups").remove(paths);
          }
          await admin.from("backups").delete().in("id", toDelete.map(b => b.id));
        }

        results.push({ ownerId, backupId, status: "completed" });
      } catch (innerErr) {
        await admin.from("backups").insert({
          id: backupId,
          owner_id: ownerId,
          backup_type: "auto_weekly",
          status: "failed",
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          record_counts: {},
          error_message: String(innerErr)
        });
        results.push({ ownerId, backupId, status: "failed" });
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
