# Deploy Scripts — NeonFoodmap ECR Pipeline

8-task pipeline để build, push, và quản lý Docker images trên AWS ECR.

```
01_create_ecr_repos.ps1   ← Task 1: Tạo ECR repos
02_test_ecr_login.ps1     ← Task 2: Test ECR login từ local
03_build_backend.ps1      ← Task 3: Build Django + Gunicorn image
04_build_frontend.ps1     ← Task 4: Build React + Nginx image
05_test_builds_local.ps1  ← Task 5: Test toàn diện builds local
06_push_ecr.ps1           ← Task 6: Push images lên ECR
07_test_pull_ecr.ps1      ← Task 7: Test pull + verify digest
08_ecr_lifecycle.ps1      ← Task 8: Setup lifecycle policies
config.ps1                ← Cấu hình chung + helper functions
run_all.ps1               ← Chạy tất cả 8 tasks
```

---

## Yêu cầu

| Tool | Kiểm tra | Cài đặt |
|---|---|---|
| Docker Desktop (đang chạy) | `docker info` | [docker.com](https://www.docker.com/products/docker-desktop/) |
| AWS CLI v2 | `aws --version` | [aws docs](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) |
| Python 3 + boto3 | `python -c "import boto3"` | `pip install boto3` |
| AWS credentials | `aws sts get-caller-identity` | `aws configure` |
| MFA device bound | — | VivoAuth-Work đã bind sẵn |

---

## Thông tin AWS

| | |
|---|---|
| Account ID | `497172038341` |
| Region | `ap-southeast-1` |
| Registry | `497172038341.dkr.ecr.ap-southeast-1.amazonaws.com` |
| MFA Serial | `arn:aws:iam::497172038341:mfa/VivoAuth-Work` |
| Backend repo | `neonfoodmap-backend` |
| Frontend repo | `neonfoodmap-frontend` |

---

## Chạy từng task

### Task 1 — Tạo ECR repos
```powershell
.\deploy\01_create_ecr_repos.ps1
```
Tạo 2 repos với scan-on-push và AES256 encryption. Idempotent — chạy lại an toàn.

### Task 2 — Test ECR login
```powershell
.\deploy\02_test_ecr_login.ps1
```
Kiểm tra chain đầy đủ: MFA → STS token → ECR password → docker login.

### Task 3 — Build backend image
```powershell
.\deploy\03_build_backend.ps1
# Force rebuild từ đầu:
.\deploy\03_build_backend.ps1 -NoCache
```
Chạy 5 smoke tests: Django import, gunicorn, file structure, packages, manage.py.

### Task 4 — Build frontend image
```powershell
.\deploy\04_build_frontend.ps1 -ViteApiUrl "http://YOUR_EC2_IP/api"
```
VITE_API_URL được bake vào bundle lúc build. Cần truyền đúng IP/domain production.

### Task 5 — Test builds locally
```powershell
.\deploy\05_test_builds_local.ps1
```
Kiểm tra bảo mật (non-root, no .env in image), HTTP response, SPA routing, integration test.

### Task 6 — Push lên ECR
```powershell
.\deploy\06_push_ecr.ps1
# Push thêm tag version:
.\deploy\06_push_ecr.ps1 -ExtraTag "v1.0.0"
```
Push 2 tags: `latest` và `YYYYMMDD-HHMM`. Verify digest sau khi push.

### Task 7 — Test pull từ ECR
```powershell
.\deploy\07_test_pull_ecr.ps1
# Pull tag cụ thể:
.\deploy\07_test_pull_ecr.ps1 -Tag "20250715-1430"
```
Xóa local cache → pull từ ECR → verify digest → smoke test → HTTP test.

### Task 8 — Setup lifecycle policies
```powershell
# Xem policy trước (không apply):
.\deploy\08_ecr_lifecycle.ps1 -DryRun

# Apply:
.\deploy\08_ecr_lifecycle.ps1
```

Lifecycle rules:

| Rule | Tag | Hành động |
|---|---|---|
| 1 (ưu tiên cao nhất) | `latest` | Giữ mãi |
| 2 | Prefix `202...` (date tags) | Giữ tối đa 10 |
| 3 | Untagged | Xóa sau 1 ngày |

---

## Chạy toàn bộ pipeline

```powershell
.\deploy\run_all.ps1 -ViteApiUrl "http://YOUR_EC2_IP/api"
```

Bắt đầu từ task cụ thể (nếu pipeline bị dừng giữa chừng):
```powershell
.\deploy\run_all.ps1 -StartFrom 6
```

---

## Lưu ý MFA

Tasks 1, 2, 6, 7, 8 cần AWS access nên sẽ hỏi MFA code.
Mã MFA có hiệu lực 30 giây — chạy nhanh sau khi nhập.
Session token STS có hiệu lực **12 giờ** nên không cần nhập lại nếu chạy script liên tiếp.

---

## Links hữu ích

- ECR Console: https://ap-southeast-1.console.aws.amazon.com/ecr/repositories?region=ap-southeast-1
- Backend repo: https://ap-southeast-1.console.aws.amazon.com/ecr/repositories/neonfoodmap-backend?region=ap-southeast-1
- Frontend repo: https://ap-southeast-1.console.aws.amazon.com/ecr/repositories/neonfoodmap-frontend?region=ap-southeast-1
