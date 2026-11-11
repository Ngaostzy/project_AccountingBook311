import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
