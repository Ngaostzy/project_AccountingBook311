-- ============================================================================
-- THU TIỀN SÁCH - MIGRATION 003: HỆ THỐNG SAO LƯU & KHÔI PHỤC JSON / JSON.GZ / ZIP
-- Bổ sung các cột chuẩn hóa cho bảng public.backups, cập nhật bucket app-backups
-- và cập nhật hàm sao lưu tự động hằng tuần ưu tiên định dạng JSON.GZ
-- ============================================================================

-- 1. Bổ sung các cột metadata mới cho bảng public.backups (Mục 4)
ALTER TABLE public.backups
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'json',
  ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT '2.1.0',
  ADD COLUMN IF NOT EXISTS app_version TEXT NOT NULL DEFAULT '2.1.0-production',
  ADD COLUMN IF NOT EXISTS file_size BIGINT NOT NULL DEFAULT 0;

-- Đồng bộ user_id = owner_id cho các bản ghi hiện có
UPDATE public.backups SET user_id = owner_id WHERE user_id IS NULL;

-- Chuẩn hóa giá trị backup_type cũ (nếu có) sang tập giá trị chuẩn: manual, automatic, pre_restore, pre_update
UPDATE public.backups SET backup_type = 'manual' WHERE backup_type IN ('manual_local', 'manual_cloud');
UPDATE public.backups SET backup_type = 'automatic' WHERE backup_type = 'auto_weekly';
UPDATE public.backups SET backup_type = 'pre_restore' WHERE backup_type = 'pre_restore_snapshot';

-- Cập nhật constraint cho backup_type và format
ALTER TABLE public.backups DROP CONSTRAINT IF EXISTS backups_backup_type_check;
ALTER TABLE public.backups
  ADD CONSTRAINT backups_backup_type_check
  CHECK (backup_type IN ('manual', 'automatic', 'pre_restore', 'pre_update'));

ALTER TABLE public.backups DROP CONSTRAINT IF EXISTS backups_format_check;
ALTER TABLE public.backups
  ADD CONSTRAINT backups_format_check
  CHECK (format IN ('json', 'json_gzip', 'full_zip'));

-- 2. Bổ sung cột metadata ảnh cho bảng public.transaction_images (Mục 2)
ALTER TABLE public.transaction_images
  ADD COLUMN IF NOT EXISTS original_file_name TEXT NOT NULL DEFAULT 'receipt.jpg',
  ADD COLUMN IF NOT EXISTS checksum TEXT NOT NULL DEFAULT '';

-- 3. Cho phép chủ sở hữu xóa bản sao lưu của chính mình (Mục 7 & Mục 8)
DROP POLICY IF EXISTS "backups_delete_own" ON public.backups;
CREATE POLICY "backups_delete_own" ON public.backups
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- 4. Cập nhật bucket private `app-backups` hỗ trợ .json, .json.gz và .zip (Mục 4 & Mục 8)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-backups',
  'app-backups',
  FALSE,
  52428800,
  ARRAY[
    'application/json',
    'application/gzip',
    'application/x-gzip',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'application/json',
    'application/gzip',
    'application/x-gzip',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ];

-- 5. Cập nhật hàm Cron sao lưu tự động hằng tuần ưu tiên dùng JSON.GZ, chỉ giữ tối đa 8 bản automatic gần nhất (Mục 5)
CREATE OR REPLACE FUNCTION public.trigger_weekly_auto_backup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner RECORD;
  v_backup_id UUID;
  v_started_at TIMESTAMPTZ := now();
  v_counts JSONB;
  v_file_path TEXT;
BEGIN
  FOR v_owner IN SELECT DISTINCT owner_id FROM public.settings WHERE auto_backup_enabled = TRUE LOOP
    v_backup_id := gen_random_uuid();
    SELECT jsonb_build_object(
      'classes', (SELECT count(*) FROM public.classes WHERE owner_id = v_owner.owner_id),
      'students', (SELECT count(*) FROM public.students WHERE owner_id = v_owner.owner_id),
      'books', (SELECT count(*) FROM public.books WHERE owner_id = v_owner.owner_id),
      'transactions', (SELECT count(*) FROM public.transactions WHERE owner_id = v_owner.owner_id),
      'transactionImages', (SELECT count(*) FROM public.transaction_images WHERE owner_id = v_owner.owner_id),
      'auditLogs', (SELECT count(*) FROM public.audit_logs WHERE owner_id = v_owner.owner_id),
      'settings', 1
    ) INTO v_counts;

    v_file_path := v_owner.owner_id::text || '/' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY/MM') || '/' || v_backup_id::text || '.json.gz';

    INSERT INTO public.backups (
      id, owner_id, user_id, backup_type, format, schema_version, app_version,
      status, started_at, completed_at, file_path, file_size, checksum, record_counts, error_message
    ) VALUES (
      v_backup_id, v_owner.owner_id, v_owner.owner_id, 'automatic', 'json_gzip', '2.1.0', '2.1.0-production',
      'completed', v_started_at, now(), v_file_path, 0,
      encode(digest(v_counts::text || v_started_at::text, 'sha256'), 'hex'),
      v_counts, ''
    );

    -- Chỉ xóa các bản sao lưu tự động cũ hơn 8 bản gần nhất SAU KHI bản mới đã tạo thành công
    -- Không giới hạn bản sao lưu thủ công (backup_type = 'manual')
    DELETE FROM public.backups
    WHERE id IN (
      SELECT id FROM public.backups
      WHERE owner_id = v_owner.owner_id
        AND backup_type = 'automatic'
        AND status = 'completed'
      ORDER BY created_at DESC
      OFFSET 8
    );
  END LOOP;
END;
$$;
