# Hướng Dẫn Cài Đặt & Chạy Backend (Django)

Dự án sử dụng **Django** cùng **Django REST Framework** cho phần backend và **MySQL** làm cơ sở dữ liệu. Dưới đây là các bước để cài đặt và chạy project trên môi trường local.

---

## 📌 1. Yêu cầu hệ thống (Prerequisites)
- **Python** (phiên bản 3.10 trở lên)
- **MySQL Server** (hoặc XAMPP / MAMP / WAMP có bao gồm MySQL)
- **Git**

---

## 📌 2. Thiết lập cơ sở dữ liệu MySQL
Trước khi chạy source code, bạn cần tạo một database trống trên MySQL.

1. Khởi động MySQL Server.
2. Mở trình quản lý MySQL (DataGrip, DBeaver, MySQL Workbench, phpMyAdmin, hoặc Terminal/Command Line).
3. Chạy câu lệnh SQL sau để tạo database (hỗ trợ lưu tiếng Việt Unicode):

```sql
CREATE DATABASE buocchancoi_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## 📌 3. Clone source code và tạo Virtual Environment
Mở Terminal/Command Prompt và chạy các lệnh sau:

### 3.1. Clone code
```bash
git clone https://github.com/HaoWasabi/NeonFoodmap.git
cd NeonFoodmap/backend
```

### 3.2. Tạo và kích hoạt môi trường ảo (Virtual Environment)
Môi trường ảo giúp cô lập các thư viện của project với hệ điều hành máy bạn.

**Trên Windows:**
```powershell
python -m venv venv
venv\Scripts\activate
```

**Trên macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```
*(Nếu kích hoạt thành công, bạn sẽ thấy `(venv)` xuất hiện ở đầu dòng lệnh).*

---

## 📌 4. Cài đặt thư viện (Dependencies)
Cài đặt tất cả các gói package Python cần thiết từ file `requirements.txt`:

```bash
pip install -r requirements.txt
```

---

## 📌 5. Thiết lập biến môi trường (.env)
Project sử dụng file `.env` để bảo mật các cấu hình nhạy cảm.
1. Copy file mẫu `.env.example` thành `.env`:
   - Trên **Windows CMD**: `copy .env.example .env`
   - Trên **Windows PowerShell**: `cp .env.example .env`
   - Trên **macOS/Linux**: `cp .env.example .env`

2. Mở file `.env` vừa tạo và điền thông tin kết nối MySQL tĩnh theo máy của bạn. Quan trọng nhất là điền mật khẩu ở `DB_PASSWORD`. Ví dụ:
```ini
# Database - MySQL
DB_NAME=buocchancoi_db
DB_USER=root
DB_PASSWORD=123456  # Sửa thành password mysql của bạn
DB_HOST=127.0.0.1
DB_PORT=3306
```

---

## 📌 6. Khởi tạo Database (Migrations) & Thiết lập mặc định
Chạy các dòng lệnh sau để tạo các bảng trong database và khởi tạo dữ liệu mặc định:

```bash
# Áp dụng các thay đổi database
python manage.py migrate

# Tạo tự động 3 nhóm phân quyền: Admin, Partner, User
python manage.py setup_groups

# Tạo tài khoản quản trị (Superuser) để truy cập trang trang admin
python manage.py createsuperuser
```
*(Làm theo hướng dẫn trên màn hình để điền Email, Username và Password cho tài khoản Admin)*.

---

## 📌 7. Chạy Server
Sau khi mọi thứ đã sẵn sàng, khởi chạy server phát triển:

```bash
python manage.py runserver
```

Truy cập trên trình duyệt:
- **API Root / Swagger (nếu có):** http://127.0.0.1:8000/api/
- **Trang quản trị (Admin):** http://127.0.0.1:8000/admin/

---

## 🐛 Các lỗi thường gặp (Troubleshooting)

1. **Lỗi `mysqlclient` khi `pip install`:**
   - **Win:** Hãy chắc chắn bạn đã cài đặt Microsoft Visual C++ Build Tools.
   - **Mac/Linux:** Vui lòng cài `mysql-connector-c` bằng brew (`brew install mysql-client pkg-config`) hoặc `libmysqlclient-dev` (trên Ubuntu: `sudo apt-get install python3-dev default-libmysqlclient-dev build-essential`).

2. **Lỗi `Unknown database 'buocchancoi_db'` khi chạy `migrate`:**
   - Bạn chưa thực hiện Bước 2 (Tạo database trên MySQL) hoặc tạo sai tên.

3. **Lỗi Access denied for user 'root'@'localhost' (using password: YES/NO):**
   - Mật khẩu đăng nhập database bị sai. Hãy kiểm tra lại file `.env` ở Bước 5. Mật khẩu phải khớp với mật khẩu ứng dụng quản lý MySQL (XAMPP/MySQL) của bạn.