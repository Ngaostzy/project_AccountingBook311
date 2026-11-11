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
