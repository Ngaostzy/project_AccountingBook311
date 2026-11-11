# HƯỚNG DẪN TRIỂN KHAI (PUBLISH) LÊN INTERNET (15 BƯỚC CHI TIẾT)

Tài liệu này hướng dẫn từng bước từ lúc tải file `thu-tien-sach-production.zip` về máy cho đến khi ứng dụng hoạt động chính thức trên iPhone của bạn.

## Bước 1: Tải project ZIP
- Tải file `thu-tien-sach-production.zip` từ cửa sổ chat về máy tính của bạn.

## Bước 2: Giải nén
- Giải nén file `thu-tien-sach-production.zip` ra một thư mục (ví dụ `thu-tien-sach`).
- Mở Terminal / Command Prompt tại thư mục vừa giải nén và kiểm tra bằng lệnh:
  ```bash
  npm install
  npm run build
  ```

## Bước 3: Đưa project lên GitHub
- Tạo một **Private Repository** mới trên GitHub (ví dụ `thu-tien-sach`).
- Đẩy mã nguồn lên GitHub (file `.gitignore` đã cấu hình sẵn để không đẩy `node_modules` hay `.env` lên GitHub):
  ```bash
  git init
  git add .
  git commit -m "Initial production release Thu Tien Sach v2.0"
  git branch -M main
  git remote add origin https://github.com/<ten-tai-khoan>/thu-tien-sach.git
  git push -u origin main
  ```

## Bước 4: Tạo Supabase Project
- Truy cập [https://supabase.com](https://supabase.com) và đăng nhập.
- Bấm **New Project**, đặt tên `thu-tien-sach`, chọn khu vực gần Việt Nam nhất (`Singapore - ap-southeast-1`) và lưu lại mật khẩu Database.

## Bước 5: Chạy Migration SQL
- Trong Supabase Dashboard, mở mục **SQL Editor** → **New query**.
- Mở file `supabase/migrations/20261111000001_init_schema_and_rls.sql` trong dự án, sao chép toàn bộ nội dung dán vào SQL Editor rồi bấm **Run**.
- Lệnh SQL này sẽ tự động tạo đủ 10 bảng (`profiles`, `classes`, `students`, `books`, `transactions`, `transaction_images`, `audit_logs`, `imports`, `backups`, `settings`), các khóa ngoại, chỉ mục (indexes), trigger `updated_at` và các chính sách bảo mật **Row Level Security (RLS)**.

## Bước 6: Tạo Storage Buckets
- Migration SQL ở Bước 5 đã tự động khởi tạo 2 private buckets cùng quyền truy cập RLS. Bạn có thể vào mục **Storage** trên Supabase Dashboard để kiểm tra xác nhận 2 bucket sau đang ở trạng thái **Private** (không phải Public):
  1. `transaction-images` (Lưu ảnh biên lai chuyển khoản theo cấu trúc `{user_id}/{year}/{month}/{transaction_id}/{filename}`)
  2. `app-backups` (Lưu các gói sao lưu `{user_id}/{year}/{month}/{backup_id}.zip`)

## Bước 7: Tạo tài khoản quản trị
- Trên Supabase Dashboard, vào **Authentication** → **Users** → bấm **Add user** → **Create new user**.
- Nhập Email và Mật khẩu của bạn (tích chọn **Auto Confirm User**), sau đó bấm **Create user**.
- (Tùy chọn) Nếu muốn đăng nhập bằng Google: vào **Authentication** → **Providers** → **Google** để bật Google OAuth.

## Bước 8: Lấy Supabase URL và Anon Key
- Vào **Project Settings** (biểu tượng bánh răng) → **API**.
- Sao chép 2 giá trị:
  1. **Project URL** (dùng cho `VITE_SUPABASE_URL`)
  2. **Project API keys → `anon` `public`** (dùng cho `VITE_SUPABASE_ANON_KEY`)
- **Tuyệt đối không** sao chép khóa `service_role` đưa vào frontend.

## Bước 9: Import Repository vào Vercel
- Truy cập [https://vercel.com](https://vercel.com), đăng nhập bằng GitHub và bấm **Add New...** → **Project**.
- Chọn repository `thu-tien-sach` vừa đẩy lên ở Bước 3 và bấm **Import**.
- Vercel sẽ tự nhận diện `Framework Preset: Vite`, `Build Command: npm run build`, `Output Directory: dist` từ file `vercel.json`.

## Bước 10: Khai báo Environment Variables trên Vercel
- Tại mục **Environment Variables** trên màn hình cấu hình Vercel, thêm 2 biến:
  - `VITE_SUPABASE_URL` = `<Project URL lấy ở Bước 8>`
  - `VITE_SUPABASE_ANON_KEY` = `<Anon public key lấy ở Bước 8>`

## Bước 11: Deploy
- Bấm nút **Deploy** và chờ khoảng 45–60 giây để Vercel hoàn tất quá trình build và cấp phát chứng chỉ HTTPS.

## Bước 12: Mở URL Production
- Mở đường dẫn `https://<ten-du-an>.vercel.app` trên trình duyệt **Safari** của iPhone và đăng nhập bằng tài khoản quản trị vừa tạo ở Bước 7.

## Bước 13: Thêm Website vào Màn hình chính iPhone (PWA)
- Trên Safari iPhone, chạm biểu tượng **Chia sẻ (Share ⬆️)** ở thanh công cụ dưới cùng → chọn **“Thêm vào Màn hình chính” (Add to Home Screen)** → bấm **Thêm (Add)**.
- Mở ứng dụng **Thu tiền sách** trực tiếp từ biểu tượng ngoài Màn hình chính iPhone (giao diện standalone toàn màn hình).

## Bước 14: Kiểm tra Database và Ảnh
- Vào mục **⚙️ Cài đặt** → bấm **☁️ Chuyển & Đối chiếu** để đồng bộ danh sách 111 học sinh và 5 lớp lên Supabase PostgreSQL.
- Thêm 1 quyển sách thử nghiệm, tạo 1 giao dịch chuyển khoản kèm chụp ảnh biên lai trên iPhone, sau đó mở chi tiết giao dịch để kiểm tra ảnh hiển thị qua Signed URL.

## Bước 15: Tạo bản sao lưu đầu tiên
- Vào mục **⚙️ Cài đặt → Sao lưu & Khôi phục**:
  - Bấm **⬇️ A. Tải file ZIP về iPhone** (lưu vào ứng dụng Files / iCloud Drive).
  - Bấm **☁️ B. Lưu vào private bucket Supabase (`app-backups`)** để lưu bản sao lưu trực tuyến đầu tiên.
