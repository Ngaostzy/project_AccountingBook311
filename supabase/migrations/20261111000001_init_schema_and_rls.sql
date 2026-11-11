-- ============================================================================
-- THU TIỀN SÁCH - PRODUCTION SUPABASE SCHEMA, INDEXES, TRIGGERS & STRICT RLS
-- Múi giờ mặc định: Asia/Ho_Chi_Minh
-- Quy ước cột chủ sở hữu thống nhất: owner_id (snake_case) <-> ownerId (camelCase ở frontend)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigger tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Bảng profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Bảng classes
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade SMALLINT NOT NULL CHECK (grade IN (10, 11)),
  teacher_name TEXT DEFAULT '',
  school_year TEXT NOT NULL DEFAULT '2026-2027',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_classes_owner_name UNIQUE (owner_id, name)
);

-- 3. Bảng students
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  class_name TEXT NOT NULL,
  stt INTEGER NOT NULL CHECK (stt > 0),
  full_name TEXT NOT NULL,
  full_name_normalized TEXT NOT NULL DEFAULT '',
  grade SMALLINT NOT NULL CHECK (grade IN (10, 11)),
  school TEXT DEFAULT '',
  facebook_url TEXT DEFAULT '',
  parent_name TEXT DEFAULT '',
  parent_phone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'studying' CHECK (status IN ('studying', 'inactive')),
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_students_owner_class_stt UNIQUE (owner_id, class_id, stt)
);

-- 4. Bảng books
CREATE TABLE IF NOT EXISTS public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  title_normalized TEXT NOT NULL DEFAULT '',
  grade SMALLINT NOT NULL CHECK (grade IN (10, 11)),
  price BIGINT NOT NULL CHECK (price >= 0),
  status TEXT NOT NULL DEFAULT 'selling' CHECK (status IN ('selling', 'stopped')),
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_books_owner_code UNIQUE (owner_id, code)
);

-- 5. Bảng transactions (Không cho phép xóa vĩnh viễn, lưu book_price_snapshot & idempotency_key)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_code TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Thu tiền', 'Hoàn tiền', 'Miễn hoặc giảm', 'Trả sách', 'Điều chỉnh')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Tiền mặt', 'Chuyển khoản')),
  book_price_snapshot BIGINT NOT NULL CHECK (book_price_snapshot >= 0),
  amount_due BIGINT NOT NULL DEFAULT 0,
  amount_received BIGINT NOT NULL CHECK (amount_received >= 0),
  balance_after BIGINT NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Hoạt động' CHECK (status IN ('Hoạt động', 'Hợp lệ', 'Đã hủy')),
  cancel_reason TEXT DEFAULT '',
  cancelled_at TIMESTAMPTZ,
  ref_transaction_id UUID REFERENCES public.transactions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_transactions_idempotency UNIQUE (owner_id, idempotency_key),
  CONSTRAINT chk_cancel_reason_required CHECK (
    status <> 'Đã hủy' OR (cancel_reason IS NOT NULL AND length(trim(cancel_reason)) > 0)
  )
);

-- 6. Bảng transaction_images (Chỉ lưu đường dẫn Storage nội bộ, không lưu base64 hay blob URL)
CREATE TABLE IF NOT EXISTS public.transaction_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  bucket_name TEXT NOT NULL DEFAULT 'transaction-images',
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_no_base64_or_blob CHECK (
    storage_path NOT LIKE 'data:%' AND storage_path NOT LIKE 'blob:%'
  )
);

-- 7. Bảng audit_logs (Bất biến - Không cho phép UPDATE hay DELETE từ frontend)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Bảng imports
CREATE TABLE IF NOT EXISTS public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Bảng backups
CREATE TABLE IF NOT EXISTS public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('manual_local', 'manual_cloud', 'auto_weekly', 'pre_restore_snapshot')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_path TEXT DEFAULT '',
  checksum TEXT DEFAULT '',
  error_message TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Bảng settings
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL DEFAULT 'THU TIỀN SÁCH',
  currency TEXT NOT NULL DEFAULT 'VND',
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  auto_backup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_backup_cron_configured BOOLEAN NOT NULL DEFAULT FALSE,
  migration_completed BOOLEAN NOT NULL DEFAULT FALSE,
  migrated_at TIMESTAMPTZ,
  ui_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES TỐI ƯU TÌM KIẾM & BÁO CÁO
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_students_owner_class ON public.students(owner_id, class_id, stt);
CREATE INDEX IF NOT EXISTS idx_students_name_norm ON public.students(owner_id, full_name_normalized);
CREATE INDEX IF NOT EXISTS idx_books_owner_grade ON public.books(owner_id, grade, status);
CREATE INDEX IF NOT EXISTS idx_transactions_student ON public.transactions(owner_id, student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_book ON public.transactions(owner_id, book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_report_class_book ON public.transactions(owner_id, class_id, book_id, status);
CREATE INDEX IF NOT EXISTS idx_transaction_images_tx ON public.transaction_images(owner_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_owner_date ON public.audit_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_owner_type_date ON public.backups(owner_id, backup_type, created_at DESC);

-- ============================================================================
-- TRIGGERS CẬP NHẬT updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_classes_updated_at ON public.classes;
CREATE TRIGGER trg_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_books_updated_at ON public.books;
CREATE TRIGGER trg_books_updated_at BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_transaction_images_updated_at ON public.transaction_images;
CREATE TRIGGER trg_transaction_images_updated_at BEFORE UPDATE ON public.transaction_images FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_imports_updated_at ON public.imports;
CREATE TRIGGER trg_imports_updated_at BEFORE UPDATE ON public.imports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_backups_updated_at ON public.backups;
CREATE TRIGGER trg_backups_updated_at BEFORE UPDATE ON public.backups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated_at ON public.settings;
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) CHO TẤT CẢ 10 BẢNG
-- So sánh nhất quán: auth.uid() = owner_id
-- Không cho phép người dùng ẩn danh (anon).
-- Không cho phép DELETE trên transactions và audit_logs.
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Policies cho profiles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id AND auth.uid() = owner_id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id AND auth.uid() = owner_id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id AND auth.uid() = owner_id) WITH CHECK (auth.uid() = id AND auth.uid() = owner_id);

-- Policies cho classes
CREATE POLICY "classes_select_own" ON public.classes FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "classes_insert_own" ON public.classes FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "classes_update_own" ON public.classes FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "classes_delete_own" ON public.classes FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Policies cho students
CREATE POLICY "students_select_own" ON public.students FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "students_insert_own" ON public.students FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "students_update_own" ON public.students FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "students_delete_own" ON public.students FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Policies cho books
CREATE POLICY "books_select_own" ON public.books FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "books_insert_own" ON public.books FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "books_update_own" ON public.books FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "books_delete_own" ON public.books FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Policies cho transactions (KHÔNG CÓ DELETE POLICY -> Không cho phép xóa vĩnh viễn giao dịch)
CREATE POLICY "transactions_select_own" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "transactions_insert_own" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "transactions_update_own" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Policies cho transaction_images
CREATE POLICY "tx_images_select_own" ON public.transaction_images FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "tx_images_insert_own" ON public.transaction_images FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "tx_images_update_own" ON public.transaction_images FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "tx_images_delete_own" ON public.transaction_images FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Policies cho audit_logs (CHỈ CHO PHÉP SELECT VÀ INSERT, KHÔNG CHO PHÉP UPDATE HAY DELETE)
CREATE POLICY "audit_logs_select_own" ON public.audit_logs FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "audit_logs_insert_own" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

-- Policies cho imports
CREATE POLICY "imports_select_own" ON public.imports FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "imports_insert_own" ON public.imports FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

-- Policies cho backups
CREATE POLICY "backups_select_own" ON public.backups FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "backups_insert_own" ON public.backups FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "backups_update_own" ON public.backups FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Policies cho settings
CREATE POLICY "settings_select_own" ON public.settings FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "settings_insert_own" ON public.settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "settings_update_own" ON public.settings FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============================================================================
-- SUPABASE PRIVATE STORAGE BUCKETS & STORAGE RLS POLICIES
-- 1. transaction-images (private): {owner_id}/{year}/{month}/{transaction_id}/{filename}
-- 2. app-backups (private): {owner_id}/{year}/{month}/{backup_id}.zip
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'transaction-images',
  'transaction-images',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-backups',
  'app-backups',
  FALSE,
  52428800,
  ARRAY['application/zip', 'application/x-zip-compressed', 'application/octet-stream', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- Storage Policies cho bucket transaction-images
CREATE POLICY "tx_images_storage_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'transaction-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "tx_images_storage_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'transaction-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "tx_images_storage_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'transaction-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "tx_images_storage_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'transaction-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage Policies cho bucket app-backups
CREATE POLICY "app_backups_storage_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'app-backups' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "app_backups_storage_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'app-backups' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "app_backups_storage_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'app-backups' AND (storage.foldername(name))[1] = auth.uid()::text);
