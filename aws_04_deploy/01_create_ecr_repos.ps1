# =============================================================================
# deploy/01_create_ecr_repos.ps1
# Task 1: Create ECR repositories (backend, frontend)
#
# - Tạo 2 ECR repos nếu chưa tồn tại
# - Bật scan on push (phát hiện CVE tự động)
# - Bật AES256 encryption
# - Gán tag Project=NeonFoodmap
# - In ra URI của từng repo
#
# Cách dùng:
#   .\deploy\01_create_ecr_repos.ps1
# =============================================================================

. "$PSScriptRoot\config.ps1"
$ErrorActionPreference = "Stop"

Write-Banner "TASK 1: Create ECR Repositories"

# ── MFA + credentials ─────────────────────────────────────────────────────────
Write-Step "Xac thuc MFA..."
$creds = Get-MFACredentials
Set-AWSSession $creds
Write-OK "Temporary credentials OK."

# ── Helper: tạo hoặc confirm repo tồn tại ─────────────────────────────────────
function Ensure-Repo([string]$repoName) {
    Write-Step "Kiem tra repo: $repoName"

    $existing = aws ecr describe-repositories `
        --repository-names $repoName `
        --region $REGION 2>&1

    if ($LASTEXITCODE -eq 0) {
        $uri = aws ecr describe-repositories `
            --repository-names $repoName `
            --region $REGION `
            --query "repositories[0].repositoryUri" `
            --output text
        Write-OK "Da ton tai: $uri"
        return $uri
    }

    # Chưa có → tạo mới
    Write-Info "Chua ton tai, dang tao..."
    $result = aws ecr create-repository `
        --repository-name $repoName `
        --region $REGION `
        --image-scanning-configuration scanOnPush=true `
        --encryption-configuration encryptionType=AES256 `
        --tags Key=Project,Value=NeonFoodmap Key=ManagedBy,Value=deploy-scripts `
        --output json | ConvertFrom-Json

    if ($LASTEXITCODE -ne 0) { Write-Fail "Tao repo $repoName that bai." }

    $uri = $result.repository.repositoryUri
    Write-OK "Da tao: $uri"
    Write-Info "  Scan on push : $(($result.repository.imageScanningConfiguration).scanOnPush)"
    Write-Info "  Encryption   : $(($result.repository.encryptionConfiguration).encryptionType)"
    return $uri
}

# ── Tạo 2 repos ──────────────────────────────────────────────────────────────
$backendUri  = Ensure-Repo $BACKEND_REPO
$frontendUri = Ensure-Repo $FRONTEND_REPO

# ── Verify bằng cách list lại ────────────────────────────────────────────────
Write-Step "Xac nhan tren ECR..."
aws ecr describe-repositories `
    --repository-names $BACKEND_REPO $FRONTEND_REPO `
    --region $REGION `
    --query "repositories[*].{Name:repositoryName, URI:repositoryUri, ScanOnPush:imageScanningConfiguration.scanOnPush}" `
    --output table

# ── Tổng kết ──────────────────────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " TASK 1 HOAN THANH" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Backend  URI : $backendUri"
Write-Host "Frontend URI : $frontendUri"
Write-Host ""
Write-Host "ECR Console  : https://$REGION.console.aws.amazon.com/ecr/repositories?region=$REGION"
Write-Host "Buoc tiep    : .\deploy\02_test_ecr_login.ps1" -ForegroundColor Cyan

Clear-AWSSession
