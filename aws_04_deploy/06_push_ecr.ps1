# =============================================================================
# deploy/06_push_ecr.ps1
# Task 6: Push test images to ECR
#
# - MFA → ECR login → tag → push (latest + date tag)
# - Tự tạo repo nếu chưa có
# - Verify image xuất hiện trên ECR sau khi push
#
# Cách dùng:
#   .\deploy\06_push_ecr.ps1
#   .\deploy\06_push_ecr.ps1 -SkipBackend
#   .\deploy\06_push_ecr.ps1 -SkipFrontend
#   .\deploy\06_push_ecr.ps1 -ExtraTag "v1.0.0"    # push thêm 1 tag tùy chỉnh
# =============================================================================

param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [string]$ExtraTag = ""
)

. "$PSScriptRoot\config.ps1"
$ErrorActionPreference = "Stop"

Write-Banner "TASK 6: Push Images to ECR"

# ── Kiểm tra local images tồn tại ────────────────────────────────────────────
Write-Step "Kiem tra local images..."
if (-not $SkipBackend) {
    $id = docker images -q "${BACKEND_REPO}:${IMAGE_TAG}"
    if (-not $id) { Write-Fail "'${BACKEND_REPO}:${IMAGE_TAG}' chua co. Chay Task 3 truoc." }
    Write-OK "${BACKEND_REPO}:${IMAGE_TAG} OK ($id)"
}
if (-not $SkipFrontend) {
    $id = docker images -q "${FRONTEND_REPO}:${IMAGE_TAG}"
    if (-not $id) { Write-Fail "'${FRONTEND_REPO}:${IMAGE_TAG}' chua co. Chay Task 4 truoc." }
    Write-OK "${FRONTEND_REPO}:${IMAGE_TAG} OK ($id)"
}

# ── MFA + credentials ─────────────────────────────────────────────────────────
Write-Step "Xac thuc MFA..."
$creds = Get-MFACredentials
Set-AWSSession $creds
Write-OK "Temporary credentials OK."

# ── Docker login vào ECR ──────────────────────────────────────────────────────
Connect-ECRDocker

# ── Helper: đảm bảo repo tồn tại ──────────────────────────────────────────────
function Ensure-Repo([string]$repoName) {
    $check = aws ecr describe-repositories `
        --repository-names $repoName --region $REGION 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Info "Repo '$repoName' chua co, dang tao..."
        aws ecr create-repository `
            --repository-name $repoName --region $REGION `
            --image-scanning-configuration scanOnPush=true `
            --encryption-configuration encryptionType=AES256 `
            --tags Key=Project,Value=NeonFoodmap | Out-Null
        Write-OK "Da tao repo: $repoName"
    }
}

# ── Helper: tag + push + verify ───────────────────────────────────────────────
function Push-Image([string]$localName, [string]$repoName, [string]$tag) {
    $remoteUri = "${REGISTRY}/${repoName}:${tag}"
    Write-Host "    Tag  : $localName → $remoteUri" -ForegroundColor DarkGray
    docker tag $localName $remoteUri
    if ($LASTEXITCODE -ne 0) { Write-Fail "docker tag that bai." }

    Write-Host "    Push : $remoteUri" -ForegroundColor DarkGray
    docker push $remoteUri
    if ($LASTEXITCODE -ne 0) { Write-Fail "docker push that bai: $remoteUri" }
    Write-OK "Pushed: $remoteUri"
}

function Verify-ECRImage([string]$repoName, [string]$tag) {
    $digest = aws ecr describe-images `
        --repository-name $repoName `
        --image-ids imageTag=$tag `
        --region $REGION `
        --query "imageDetails[0].imageDigest" `
        --output text 2>&1
    if ($LASTEXITCODE -eq 0 -and $digest -like "sha256:*") {
        Write-OK "Verified tren ECR ($tag): $digest"
    } else {
        Write-Info "Verify: $digest"
    }
}

# ── Push Backend ──────────────────────────────────────────────────────────────
if (-not $SkipBackend) {
    Write-Step "Push backend → ECR ($BACKEND_REPO)"
    Ensure-Repo $BACKEND_REPO
    Push-Image "${BACKEND_REPO}:${IMAGE_TAG}"  $BACKEND_REPO $IMAGE_TAG
    Push-Image "${BACKEND_REPO}:${IMAGE_TAG}"  $BACKEND_REPO $DATE_TAG
    if ($ExtraTag) {
        Push-Image "${BACKEND_REPO}:${IMAGE_TAG}" $BACKEND_REPO $ExtraTag
    }
    Verify-ECRImage $BACKEND_REPO $IMAGE_TAG
    Verify-ECRImage $BACKEND_REPO $DATE_TAG
}

# ── Push Frontend ─────────────────────────────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Step "Push frontend → ECR ($FRONTEND_REPO)"
    Ensure-Repo $FRONTEND_REPO
    Push-Image "${FRONTEND_REPO}:${IMAGE_TAG}" $FRONTEND_REPO $IMAGE_TAG
    Push-Image "${FRONTEND_REPO}:${IMAGE_TAG}" $FRONTEND_REPO $DATE_TAG
    if ($ExtraTag) {
        Push-Image "${FRONTEND_REPO}:${IMAGE_TAG}" $FRONTEND_REPO $ExtraTag
    }
    Verify-ECRImage $FRONTEND_REPO $IMAGE_TAG
    Verify-ECRImage $FRONTEND_REPO $DATE_TAG
}

# ── Liệt kê images trên ECR ───────────────────────────────────────────────────
Write-Step "Images hien tai tren ECR..."
foreach ($repo in @($BACKEND_REPO, $FRONTEND_REPO)) {
    Write-Host "  [$repo]" -ForegroundColor Yellow
    aws ecr describe-images `
        --repository-name $repo --region $REGION `
        --query "sort_by(imageDetails, &imagePushedAt)[-3:].{Tag:imageTags[0],Digest:imageDigest,Size:imageSizeInBytes,Pushed:imagePushedAt}" `
        --output table 2>&1
}

# ── Tổng kết ──────────────────────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " TASK 6 HOAN THANH" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
if (-not $SkipBackend) {
    Write-Host "Backend:"
    Write-Host "  ${REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}"
    Write-Host "  ${REGISTRY}/${BACKEND_REPO}:${DATE_TAG}"
}
if (-not $SkipFrontend) {
    Write-Host "Frontend:"
    Write-Host "  ${REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}"
    Write-Host "  ${REGISTRY}/${FRONTEND_REPO}:${DATE_TAG}"
}
Write-Host ""
Write-Host "Buoc tiep: .\deploy\07_test_pull_ecr.ps1" -ForegroundColor Cyan

Clear-AWSSession
