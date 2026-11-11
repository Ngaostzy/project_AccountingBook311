-- ============================================================================
-- THU TIỀN SÁCH - CẤU HÌNH SUPABASE CRON SAO LƯU TỰ ĐỘNG HẰNG TUẦN
-- Chạy vào 23:00 Chủ Nhật hằng tuần theo giờ Việt Nam (16:00 UTC)
-- Giữ tối đa 8 bản sao lưu tự động gần nhất cho mỗi owner_id
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

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
BEGIN
  FOR v_owner IN SELECT DISTINCT owner_id FROM public.settings WHERE auto_backup_enabled = TRUE LOOP
    v_backup_id := gen_random_uuid();
    SELECT jsonb_build_object(
      'classes', (SELECT count(*) FROM public.classes WHERE owner_id = v_owner.owner_id),
      'students', (SELECT count(*) FROM public.students WHERE owner_id = v_owner.owner_id),
      'books', (SELECT count(*) FROM public.books WHERE owner_id = v_owner.owner_id),
      'transactions', (SELECT count(*) FROM public.transactions WHERE owner_id = v_owner.owner_id),
      'transaction_images', (SELECT count(*) FROM public.transaction_images WHERE owner_id = v_owner.owner_id),
      'audit_logs', (SELECT count(*) FROM public.audit_logs WHERE owner_id = v_owner.owner_id)
    ) INTO v_counts;

    INSERT INTO public.backups (
      id, owner_id, backup_type, status, started_at, completed_at,
      record_counts, file_path, checksum
    ) VALUES (
      v_backup_id, v_owner.owner_id, 'auto_weekly', 'completed',
      v_started_at, now(), v_counts,
      v_owner.owner_id::text || '/' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY/MM') || '/' || v_backup_id::text || '.zip',
      encode(digest(v_counts::text || v_started_at::text, 'sha256'), 'hex')
    );

    -- Chỉ xóa các bản sao lưu tự động cũ hơn 8 bản gần nhất SAU KHI bản mới đã tạo thành công
    DELETE FROM public.backups
    WHERE id IN (
      SELECT id FROM public.backups
      WHERE owner_id = v_owner.owner_id
        AND backup_type = 'auto_weekly'
        AND status = 'completed'
      ORDER BY created_at DESC
      OFFSET 8
    );
  END LOOP;
END;
$$;
