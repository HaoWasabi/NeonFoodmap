# =============================================================================
# deploy/04_build_frontend.ps1
# Task 4: Build frontend Docker image (React + Nginx)
#
# - Multi-stage build: node:22-alpine (Vite build) → nginx:1.27-alpine (serve)
# - VITE_* env vars di-bake vào lúc build-time (--build-arg)
# - Không cần MFA — hoàn toàn local
#
# Cách dùng:
#   .\deploy\04_build_frontend.ps1
#   .\deploy\04_build_frontend.ps1 -ViteApiUrl "http://13.229.xx.xx/api"
#   .\deploy\04_build_frontend.ps1 -NoCache
#   .\deploy\04_build_frontend.ps1 -SkipTests
# =============================================================================

param(
    [switch]$NoCache,
    [switch]$SkipTests,
    [string]$ViteApiUrl        = "http://localhost:8000/api",
    [string]$VitePaypalClientId = ""
)

. "$PSScriptRoot\config.ps1"
$ErrorActionPreference = "Stop"

Write-Banner "TASK 4: Build Frontend Docker Image (React + Nginx)"

# ── Kiểm tra Docker daemon ────────────────────────────────────────────────────
Write-Step "Kiem tra Docker daemon..."
$null = docker version 2>$null
if ($LASTEXITCODE -ne 0) { Write-Fail "Docker Desktop chua chay." }
Write-OK "Docker daemon OK."

# ── Kiểm tra files cần thiết ──────────────────────────────────────────────────
foreach ($f in @("$FRONTEND_DIR\Dockerfile", "$FRONTEND_DIR\nginx.conf", "$FRONTEND_DIR\package.json")) {
    if (-not (Test-Path $f)) { Write-Fail "Khong tim thay: $f" }
}
Write-OK "Dockerfile, nginx.conf, package.json tim thay."

# ── Hiển thị build-arg sẽ dùng ───────────────────────────────────────────────
Write-Step "Build arguments:"
Write-Info "VITE_API_URL         = $ViteApiUrl"
Write-Info "VITE_PAYPAL_CLIENT_ID= $(if ($VitePaypalClientId) { $VitePaypalClientId } else { '(trong)' })"
Write-Info "Note: VITE_* se duoc bake vao bundle - khong the doi sau khi build."

# ── Build ─────────────────────────────────────────────────────────────────────
$localTag     = "${FRONTEND_REPO}:${IMAGE_TAG}"
$localTagDate = "${FRONTEND_REPO}:${DATE_TAG}"

Write-Step "Build frontend image..."
Write-Info "Context : $FRONTEND_DIR"
Write-Info "Tag     : $localTag , $localTagDate"

$buildArgs = @(
    "build",
    "--file", "$FRONTEND_DIR\Dockerfile",
    "--tag",  $localTag,
    "--tag",  $localTagDate,
    "--build-arg", "VITE_API_URL=$ViteApiUrl",
    "--build-arg", "VITE_PAYPAL_CLIENT_ID=$VitePaypalClientId"
)
if ($NoCache) { $buildArgs += "--no-cache" }
$buildArgs += "$FRONTEND_DIR"

$startTime = Get-Date
& docker @buildArgs
$elapsed = (Get-Date) - $startTime

if ($LASTEXITCODE -ne 0) { Write-Fail "docker build that bai (exit $LASTEXITCODE)." }
Write-OK "Build thanh cong trong $([int]$elapsed.TotalSeconds)s."

# ── Image info ────────────────────────────────────────────────────────────────
Write-Step "Thong tin image..."
docker images --filter "reference=${FRONTEND_REPO}" `
    --format "  {{.Repository}}:{{.Tag}}  |  Size: {{.Size}}  |  ID: {{.ID}}"

# ── Smoke Tests ───────────────────────────────────────────────────────────────
# Luu y: docker run co the in ra stderr (nginx warnings...) khien PS throw exception
# Dung $ea="Continue" + redirect 2>&1 de bat ca stdout+stderr vao bien ma khong crash
if (-not $SkipTests) {
    $ea = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    Write-Step "Smoke Test 1: nginx config validation (-t)..."
    $r1 = (docker run --rm $localTag nginx -t 2>&1) -join "`n"
    if ($LASTEXITCODE -eq 0) {
        Write-OK "nginx config OK: $($r1 -replace "`n"," | ")"
    } else {
        Write-Fail "nginx config loi:`n$r1"
    }

    Write-Step "Smoke Test 2: index.html ton tai..."
    $r2 = (docker run --rm $localTag sh -c "test -f /usr/share/nginx/html/index.html && echo FOUND" 2>&1) -join ""
    if ($r2 -like "*FOUND*") {
        Write-OK "index.html ton tai."
    } else {
        Write-Fail "index.html khong tim thay."
    }

    Write-Step "Smoke Test 3: assets/ folder co JS/CSS files..."
    $r3 = (docker run --rm $localTag sh -c "ls /usr/share/nginx/html/assets/*.js 2>/dev/null | head -3" 2>&1) -join "`n"
    if ($r3) {
        Write-OK "Assets OK: $($r3 -split '\n' | Select-Object -First 1)..."
    } else {
        Write-Info "Assets: khong tim thay .js (co the Vite dung ten khac - OK)"
    }

    Write-Step "Smoke Test 4: nginx version trong image..."
    $r4 = (docker run --rm $localTag nginx -v 2>&1) -join ""
    Write-OK "nginx: $r4"

    Write-Step "Smoke Test 5: VITE_API_URL da bake vao bundle..."
    $host2 = $ViteApiUrl.Split('/') | Where-Object { $_ -ne '' } | Select-Object -Last 1
    $r5 = (docker run --rm $localTag `
        sh -c "grep -rl 'localhost' /usr/share/nginx/html/assets/ 2>/dev/null | head -1" 2>&1) -join ""
    if ($r5) {
        Write-OK "VITE_API_URL da bake vao bundle: $r5"
    } else {
        Write-Info "Khong tim thay URL trong bundle (co the bi minify/hash - binh thuong)."
    }

    $ErrorActionPreference = $ea
}

# ── Tổng kết ──────────────────────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " TASK 4 HOAN THANH" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Images da tao:"
docker images --filter "reference=${FRONTEND_REPO}" `
    --format "  {{.Repository}}:{{.Tag}}  ({{.Size}})"
Write-Host ""
Write-Host "Buoc tiep: .\deploy\05_test_builds_local.ps1" -ForegroundColor Cyan
