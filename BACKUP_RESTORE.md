# HƯỚNG DẪN SAO LƯU VÀ KHÔI PHỤC DỮ LIỆU AN TOÀN

## 1. Cấu trúc gói sao lưu `.ZIP` (`Thu_tien_sach_backup_YYYY-MM-DD_HH-mm.zip`)
Mỗi bản sao lưu tạo ra một file `.zip` chuẩn chứa 8 file JSON:
- `metadata.json`: Lưu `schema_version`, `app_version`, thời gian sao lưu, `user_id`, số lượng bản ghi từng bảng và mã `checksum`.
- `classes.json`, `students.json`, `books.json`, `transactions.json`, `transaction_images.json`, `audit_logs.json`, `settings.json`.
- **Bảo mật**: Không chứa mật khẩu, access token, refresh token, API key, service role key hay signed URL.

## 2. Quy trình 9 bước kiểm tra trước khi Khôi phục
Khi bạn chọn một file `.zip` để khôi phục trong **⚙️ Cài đặt → Khôi phục từ ZIP**, ứng dụng tự động thực hiện:
1. Kiểm tra cấu trúc nhị phân và CRC32 của file ZIP (chặn ngay nếu file ZIP bị hỏng).
2. Kiểm tra `schema_version`.
3. Kiểm tra sự tồn tại của đủ 8 file JSON bắt buộc.
4. Kiểm tra cấu trúc mảng dữ liệu từng bảng.
5. Kiểm tra toàn vẹn khóa ngoại (lớp học - học sinh - sách - giao dịch).
6. Kiểm tra đối chiếu UUID trùng lặp.
7. Hiển thị bảng tóm tắt số lượng bản ghi sẽ **Thêm mới**, **Cập nhật** hoặc **Giữ nguyên**.
8. Tự động chụp một bản sao lưu trạng thái hiện tại để **Rollback tự động** nếu có sự cố.
9. Yêu cầu nhập chính xác cụm từ xác nhận: `XAC NHAN KHOI PHUC`.
