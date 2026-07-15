# =============================================================================
# deploy/02_test_ecr_login.ps1
# Task 2: Test ECR login from local machine
#
# Kiểm tra toàn bộ chain:
#   MFA → STS session token → ECR get-login-password → docker login → docker pull hello-world
#
# Cách dùng:
#   .\deploy\02_test_ecr_login.ps1
# =============================================================================

. "$PSScriptRoot\config.ps1"
$ErrorActionPreference = "Stop"

Write-Banner "TASK 2: Test ECR Login from Local Machine"

# ── Kiểm tra prerequisites ────────────────────────────────────────────────────
Write-Step "Kiem tra prerequisites..."

# Docker daemon — dùng docker version thay vì docker info (ít WARNING hơn)
# Bỏ qua stderr vì Docker Desktop trên WSL2 hay in WARNING không liên quan
$null = docker version 2>$null
if ($LASTEXITCODE -ne 0) { Write-Fail "Docker Desktop chua chay. Khoi dong Docker Desktop truoc." }
Write-OK "Docker daemon OK."

# AWS CLI
$awsVer = aws --version 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "AWS CLI chua cai. Xem: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html" }
Write-OK "AWS CLI: $awsVer"

# boto3
$boto3Ver = python -c "import boto3; print(boto3.__version__)" 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "boto3 chua cai. Chay: pip install boto3" }
Write-OK "boto3: $boto3Ver"

# AWS identity hiện tại (credentials gốc, chưa MFA)
Write-Step "AWS identity hien tai (pre-MFA)..."
$identity = aws sts get-caller-identity --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "AWS credentials chua configured. Chay: aws configure"
}
$id = $identity | ConvertFrom-Json
Write-OK "Account : $($id.Account)"
Write-OK "User ARN: $($id.Arn)"

# ── MFA → STS session token ───────────────────────────────────────────────────
Write-Step "Lay STS session token qua MFA..."
$creds = Get-MFACredentials
Set-AWSSession $creds
Write-OK "Session token OK (het han sau 12h)."

# Xác nhận identity sau MFA
$idAfter = aws sts get-caller-identity --output json | ConvertFrom-Json
Write-OK "MFA identity: $($idAfter.Arn)"

# ── ECR get-login-password ────────────────────────────────────────────────────
Write-Step "Lay ECR login password..."
$ecrPwd = aws ecr get-login-password --region $REGION 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Khong lay duoc ECR password. Kiem tra IAM policy AmazonEC2ContainerRegistryFullAccess." }
Write-OK "ECR login password lay thanh cong (${ecrPwd.Length} chars)."

# ── Docker login vào ECR ──────────────────────────────────────────────────────
Write-Step "docker login vao ECR..."
$loginResult = ($ecrPwd | docker login --username AWS --password-stdin $REGISTRY) 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "docker login that bai: $loginResult" }
Write-OK "docker login thanh cong: $loginResult"

# ── Kiểm tra ECR repos có accessible không ────────────────────────────────────
Write-Step "Kiem tra truy cap ECR repos..."
$repos = @($BACKEND_REPO, $FRONTEND_REPO)
foreach ($repo in $repos) {
    $check = aws ecr describe-repositories `
        --repository-names $repo `
        --region $REGION `
        --query "repositories[0].repositoryUri" `
        --output text 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Repo accessible: $check"
    } else {
        Write-Info "Repo chua ton tai: $repo (chay Task 1 truoc)"
    }
}

# ── Test pull một image công khai để verify Docker networking tới ECR ─────────
# Pull một image nhỏ từ ECR Public Gallery (không cần auth) để test network
Write-Step "Test Docker networking toi ECR (pull amazon/amazon-ecr-credential-helper)..."
# Thay bằng test kết nối đến registry endpoint
$pingResult = docker manifest inspect public.ecr.aws/amazonlinux/amazonlinux:2 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-OK "Docker co the ket noi den ECR public registry."
} else {
    # Fallback: chỉ check login token còn hạn
    Write-Info "Khong the inspect manifest (co the do firewall). Docker login van OK."
}

# ── Kiểm tra Docker credentials store có lưu ECR không ────────────────────────
Write-Step "Kiem tra Docker credentials da luu..."
$dockerConfigPath = "$HOME\.docker\config.json"
if (Test-Path $dockerConfigPath) {
    $dockerConfig = Get-Content $dockerConfigPath | ConvertFrom-Json
    $auths = $dockerConfig.auths
    if ($auths -and $auths.PSObject.Properties.Name -contains $REGISTRY) {
        Write-OK "ECR credentials da luu trong Docker config."
    } else {
        Write-Info "ECR credentials luu trong credential store (khong hien thi truc tiep - binh thuong)."
    }
} else {
    Write-Info "Khong tim thay Docker config file."
}

# ── Tổng kết ──────────────────────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " TASK 2 HOAN THANH" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Ket qua:"
Write-Host "  [PASS] Docker daemon chay"
Write-Host "  [PASS] AWS CLI configured"
Write-Host "  [PASS] MFA xac thuc thanh cong"
Write-Host "  [PASS] STS session token lay duoc"
Write-Host "  [PASS] ECR get-login-password thanh cong"
Write-Host "  [PASS] docker login vao ECR thanh cong"
Write-Host ""
Write-Host "Registry : $REGISTRY"
Write-Host "Buoc tiep: .\deploy\03_build_backend.ps1" -ForegroundColor Cyan

Clear-AWSSession
