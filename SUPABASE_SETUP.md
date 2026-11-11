# HƯỚNG DẪN CẤU HÌNH SUPABASE CHI TIẾT

## 1. Danh sách các file Migration SQL cần chạy
Chạy lần lượt trong **Supabase Dashboard → SQL Editor**:
1. `supabase/migrations/20261111000001_init_schema_and_rls.sql`:
   - Tạo 10 bảng: `profiles`, `classes`, `students`, `books`, `transactions`, `transaction_images`, `audit_logs`, `imports`, `backups`, `settings`.
   - Thiết lập khóa ngoại, unique constraints (`uq_transactions_idempotency`, `uq_classes_user_name`, `uq_students_user_class_stt`, `uq_books_user_code`) và các chỉ mục tìm kiếm/báo cáo.
   - Bật Row Level Security (RLS) cho cả 10 bảng và thu hồi toàn bộ quyền của `anon`.
   - Khởi tạo 2 private Storage buckets (`transaction-images` và `app-backups`) cùng Storage RLS policies.
2. `supabase/migrations/20261111000002_weekly_auto_backup_cron.sql`:
   - Tạo hàm `public.trigger_weekly_auto_backup()` và cấu hình `pg_cron` để tự động tạo bản sao lưu hằng tuần và chỉ giữ tối đa 8 bản tự động gần nhất.

## 2. Triển khai Supabase Edge Function cho Sao lưu tự động (Tùy chọn)
Nếu bạn muốn chạy Edge Function `weekly-backup`:
```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase functions deploy weekly-backup
```
Sau khi cấu hình lịch chạy Cron trong Supabase Dashboard → Integrations → Cron, hãy cập nhật cột `auto_backup_cron_configured = true` trong bảng `settings` để giao diện hiển thị trạng thái **Đã bật Cron**.
