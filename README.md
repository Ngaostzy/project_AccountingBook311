# THU TIỀN SÁCH — Ứng dụng Web Mobile-First (PWA) Quản Lý Thu Tiền Sách Học Sinh

Ứng dụng **THU TIỀN SÁCH** được thiết kế chuyên biệt cho giáo viên sử dụng trên **iPhone bằng trình duyệt Safari** (hỗ trợ cài đặt ra Màn hình chính như một Progressive Web App - PWA).

## Điểm nổi bật của phiên bản Production (v2.0.0)

1. **Luồng Thu tiền nhanh liên tiếp (Chọn sách → Chọn lớp → Chọn liên tiếp học sinh → Xác nhận)**:
   - Chọn quyển sách một lần, lọc đúng các lớp thuộc khối 10 hoặc 11 của quyển sách đó.
   - Sau mỗi giao dịch, ứng dụng **giữ nguyên sách, lớp và phương thức thanh toán gần nhất**, tự động xóa ô tìm kiếm cũ, đưa con trỏ về ô tìm kiếm và đánh dấu học sinh vừa thu để thu liên tiếp 20+ học sinh chỉ với 3 chạm mỗi em.
2. **Kiểm soát thu trùng & sai sót chặt chẽ**:
   - Cảnh báo xác nhận khi chạm vào học sinh đã đóng đủ.
   - Cơ chế `idempotency_key` + khóa trạng thái chống tạo 2 giao dịch khi bấm nút xác nhận 2 lần liên tiếp.
   - Bảo toàn lịch sử giá sách tại thời điểm thu bằng trường `book_price_snapshot`.
3. **Hệ thống lưu trữ riêng bằng Supabase (PostgreSQL + Auth + Private Storage + RLS)**:
   - 10 bảng dữ liệu chuẩn UUID (`profiles`, `classes`, `students`, `books`, `transactions`, `transaction_images`, `audit_logs`, `imports`, `backups`, `settings`).
   - Bật Row Level Security (RLS) trên toàn bộ 10 bảng; chặn hoàn toàn truy cập ẩn danh (`anon`) và không cho phép xóa vĩnh viễn giao dịch (`transactions`) hay lịch sử kiểm toán (`audit_logs`).
   - Lưu ảnh biên lai chuyển khoản vào private bucket `transaction-images` và hiển thị qua **Signed URL có thời hạn**.
4. **Sao lưu & Khôi phục `.ZIP` 9 bước + Xuất Excel `.XLSX` 9 sheets**:
   - Xuất báo cáo Excel `.xlsx` gồm 9 sheets (`Tổng quan`, `Đã đóng`, `Chưa đóng`, `Còn thiếu`, `Đóng dư`, `Theo lớp`, `Theo sách`, `Theo ngày`, `Toàn bộ giao dịch`) với dữ liệu số nguyên.
   - Sao lưu gói `.ZIP` gồm 8 file JSON kèm mã băm `checksum` về iPhone (Files / iCloud Drive) hoặc lên private bucket `app-backups`.

## Các lệnh chạy dự án

```bash
# 1. Cài đặt thư viện
npm install

# 2. Chạy môi trường phát triển (Development)
npm run dev

# 3. Kiểm tra kiểu dữ liệu TypeScript
npm run typecheck

# 4. Chạy bộ 25 bài kiểm thử tự động
npm test

# 5. Đóng gói bản Production (tạo thư mục dist/)
npm run build

# 6. Xem trước bản Production tại máy
npm run preview
```

Xem chi tiết hướng dẫn triển khai từng bước tại:
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Hướng dẫn Publish 15 bước lên GitHub, Supabase và Vercel
- [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) — Hướng dẫn thiết lập Database SQL, RLS, Auth & Storage Buckets
- [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md) — Hướng dẫn Sao lưu thủ công, Sao lưu tự động hằng tuần & Khôi phục an toàn


## 8. Hệ thống Sao lưu & Khôi phục JSON / JSON.GZ / ZIP (Bản cập nhật v2.1.0)
- **3 hình thức sao lưu**:
  1. **Sao lưu nhanh dạng JSON (`.json`)**: UTF-8, nhanh, dễ kiểm tra, không nhúng ảnh Base64 (chỉ lưu metadata ảnh & `storagePath`).
  2. **Sao lưu nén dạng JSON.GZ (`.json.gz`)**: Nén bằng Web API gốc `CompressionStream('gzip')`, tự động chuyển về `.json` thường và thông báo rõ nếu trình duyệt không hỗ trợ.
  3. **Sao lưu đầy đủ dạng ZIP (`.zip`)**: Giữ nguyên chức năng sao lưu gói ZIP 8 file.
- **Quy trình Canonicalize & tính SHA-256 Checksum**:
  1. Tạo đối tượng dữ liệu gồm `metadata` (loại trừ trường `checksum`) và 7 mảng dữ liệu (`classes`, `students`, `books`, `transactions`, `transactionImages`, `auditLogs`, `settings`).
  2. Sắp xếp đệ quy toàn bộ key của mọi object theo thứ tự từ điển (`canonicalizeValue`) và tuần tự hóa bằng `JSON.stringify` không khoảng trắng thừa.
  3. Băm chuỗi UTF-8 bằng `crypto.subtle.digest('SHA-256')` tạo chuỗi 64 ký tự hex.
- **Migration SQL cần chạy**:
  - `supabase/migrations/20261111000001_init_schema_and_rls.sql`
  - `supabase/migrations/20261111000002_weekly_auto_backup_cron.sql`
  - `supabase/migrations/20261111000003_json_backup_and_restore.sql` (Mới)
