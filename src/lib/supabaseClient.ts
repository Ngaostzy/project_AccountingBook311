import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  BackupDbRow,
  BackupFormat,
  BackupRecord,
  BackupRecordCounts,
  BackupType
} from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'thu-tien-sach-supabase-auth'
      }
    })
  : null;

/**
 * Lấy ID của người dùng đang đăng nhập qua Supabase Auth (user.id) làm ownerId cho bản ghi.
 */
export async function getAuthenticatedOwnerId(): Promise<string> {
  if (!supabase) {
    throw new Error('Chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY');
  }
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user || !user.id) {
    throw new Error(error?.message || 'Người dùng chưa đăng nhập vào Supabase Auth');
  }
  return user.id;
}

export async function uploadReceiptToPrivateBucket(
  ownerId: string,
  transactionId: string,
  fileName: string,
  compressedBlob: Blob
): Promise<{ storagePath: string; fileSize: number }> {
  if (!supabase) {
    throw new Error('Chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY');
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${ownerId}/${year}/${month}/${transactionId}/${safeName}`;

  const { error } = await supabase.storage
    .from('transaction-images')
    .upload(storagePath, compressedBlob, {
      contentType: compressedBlob.type || 'image/jpeg',
      upsert: false
    });

  if (error) {
    throw new Error(`Upload ảnh thất bại: ${error.message}`);
  }
  return { storagePath, fileSize: compressedBlob.size };
}

export async function getReceiptSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase');
  }
  const { data, error } = await supabase.storage
    .from('transaction-images')
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Không thể tạo Signed URL cho ảnh chuyển khoản');
  }
  return data.signedUrl;
}

/**
 * Kiểm tra các ảnh được tham chiếu trong transactionImages có tồn tại thực tế trong bucket `transaction-images` hay không (Mục 2).
 */
export async function verifyExistingTransactionImagesInStorage(
  storagePaths: string[]
): Promise<Set<string>> {
  const existing = new Set<string>();
  if (!supabase || storagePaths.length === 0) {
    return existing;
  }
  for (const fullPath of storagePaths) {
    const parts = fullPath.split('/');
    const fileName = parts.pop() || '';
    const folder = parts.join('/');
    const { data, error } = await supabase.storage
      .from('transaction-images')
      .list(folder, { search: fileName, limit: 5 });
    if (!error && Array.isArray(data) && data.some((item) => item.name === fileName)) {
      existing.add(fullPath);
    }
  }
  return existing;
}

/**
 * Lưu bản sao lưu trực tuyến (.json, .json.gz hoặc .zip) vào private bucket `app-backups`
 * và ghi metadata vào bảng `public.backups` (Mục 4 & Mục 8).
 * Chỉ báo thành công sau khi cả bước tải lên Storage và bước ghi bảng `backups` đều hoàn tất.
 */
export async function uploadOnlineBackupAndRecordMetadata(params: {
  backupId: string;
  backupType: BackupType;
  format: BackupFormat;
  schemaVersion: string;
  appVersion: string;
  startedAt: string;
  bytes: Uint8Array;
  mimeType: string;
  checksum: string;
  recordCounts: BackupRecordCounts;
}): Promise<BackupRecord> {
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase để sao lưu trực tuyến.');
  }
  const ownerId = await getAuthenticatedOwnerId();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = params.format === 'json_gzip' ? 'json.gz' : params.format === 'full_zip' ? 'zip' : 'json';
  const filePath = `${ownerId}/${year}/${month}/${params.backupId}.${ext}`;

  const safeBuffer = new ArrayBuffer(params.bytes.byteLength);
  new Uint8Array(safeBuffer).set(params.bytes);
  const uploadBlob = new Blob([safeBuffer], { type: params.mimeType });

  // Bước 3: Upload file lên private bucket app-backups
  const { error: uploadError } = await supabase.storage
    .from('app-backups')
    .upload(filePath, uploadBlob, {
      contentType: params.mimeType,
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Tải bản sao lưu lên Storage thất bại: ${uploadError.message}`);
  }

  const completedAt = new Date().toISOString();
  const dbRow: BackupDbRow = {
    id: params.backupId,
    owner_id: ownerId,
    user_id: ownerId,
    backup_type: params.backupType,
    format: params.format,
    schema_version: params.schemaVersion,
    app_version: params.appVersion,
    status: 'completed',
    started_at: params.startedAt,
    completed_at: completedAt,
    file_path: filePath,
    file_size: params.bytes.byteLength,
    checksum: params.checksum,
    record_counts: params.recordCounts,
    error_message: '',
    created_at: completedAt
  };

  // Bước 4: Ghi metadata vào bảng backups
  const { error: insertError } = await supabase.from('backups').insert(dbRow);
  if (insertError) {
    throw new Error(`Ghi metadata vào bảng backups thất bại: ${insertError.message}`);
  }

  return {
    id: dbRow.id,
    ownerId,
    backupType: dbRow.backup_type,
    format: dbRow.format,
    schemaVersion: dbRow.schema_version,
    appVersion: dbRow.app_version,
    status: dbRow.status,
    startedAt: dbRow.started_at,
    completedAt: dbRow.completed_at ?? undefined,
    filePath: dbRow.file_path,
    fileSize: dbRow.file_size,
    checksum: dbRow.checksum,
    recordCounts: dbRow.record_counts,
    errorMessage: dbRow.error_message,
    createdAt: dbRow.created_at,
    deletable: dbRow.backup_type === 'manual'
  };
}

/**
 * Tạo Signed URL có thời hạn để tải bản sao lưu từ private bucket `app-backups` (Mục 8).
 * Tuyệt đối không dùng public URL cho file backup.
 */
export async function createBackupSignedDownloadUrl(
  filePath: string,
  expiresInSeconds = 900
): Promise<string> {
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase.');
  }
  const ownerId = await getAuthenticatedOwnerId();
  if (!filePath.startsWith(`${ownerId}/`)) {
    throw new Error('RLS_ACCESS_DENIED: Bạn không có quyền tải bản sao lưu của người dùng khác.');
  }
  const { data, error } = await supabase.storage
    .from('app-backups')
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Không thể tạo Signed URL cho file sao lưu.');
  }
  return data.signedUrl;
}

/**
 * Xóa bản sao lưu của chính người dùng trong `app-backups` và bảng `backups` (Mục 7 & Mục 8).
 */
export async function deleteOwnBackup(backupId: string, filePath: string): Promise<void> {
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase.');
  }
  const ownerId = await getAuthenticatedOwnerId();
  if (!filePath.startsWith(`${ownerId}/`)) {
    throw new Error('RLS_ACCESS_DENIED: Không được phép xóa bản sao lưu của người dùng khác.');
  }
  await supabase.storage.from('app-backups').remove([filePath]);
  const { error } = await supabase
    .from('backups')
    .delete()
    .eq('id', backupId)
    .eq('owner_id', ownerId);
  if (error) {
    throw new Error(`Xóa bản sao lưu thất bại: ${error.message}`);
  }
}
