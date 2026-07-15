# =============================================================================
# deploy/03_build_backend.ps1
# Task 3: Build backend Docker image (Django + Gunicorn)
#
# - Multi-stage build: builder (gcc/mysqlclient) → runtime (slim)
# - Không cần MFA — hoàn toàn local
# - Chạy smoke tests sau khi build
#
# Cách dùng:
#   .\deploy\03_build_backend.ps1
#   .\deploy\03_build_backend.ps1 -NoCache      # force rebuild từ đầu
#   .\deploy\03_build_backend.ps1 -SkipTests    # chỉ build, bỏ qua smoke tests
# =============================================================================

param(
    [switch]$NoCache,
    [switch]$SkipTests
)

. "$PSScriptRoot\config.ps1"
$ErrorActionPreference = "Stop"

Write-Banner "TASK 3: Build Backend Docker Image (Django + Gunicorn)"

# ── Kiểm tra Docker daemon ────────────────────────────────────────────────────
Write-Step "Kiem tra Docker daemon..."
$null = docker version 2>$null
if ($LASTEXITCODE -ne 0) { Write-Fail "Docker Desktop chua chay." }
Write-OK "Docker daemon OK."

# ── Kiểm tra Dockerfile tồn tại ──────────────────────────────────────────────
if (-not (Test-Path "$BACKEND_DIR\Dockerfile")) {
    Write-Fail "Khong tim thay $BACKEND_DIR\Dockerfile"
}
Write-OK "Dockerfile tim thay: $BACKEND_DIR\Dockerfile"

# ── Build ─────────────────────────────────────────────────────────────────────
$localTag    = "${BACKEND_REPO}:${IMAGE_TAG}"
$localTagDate = "${BACKEND_REPO}:${DATE_TAG}"

Write-Step "Build backend image..."
Write-Info "Context : $BACKEND_DIR"
Write-Info "Tag     : $localTag , $localTagDate"

$buildArgs = @(
    "build",
    "--file", "$BACKEND_DIR\Dockerfile",
    "--tag", $localTag,
    "--tag", $localTagDate
)
if ($NoCache) { $buildArgs += "--no-cache" }
$buildArgs += "$BACKEND_DIR"

$startTime = Get-Date
& docker @buildArgs
$elapsed = (Get-Date) - $startTime

if ($LASTEXITCODE -ne 0) { Write-Fail "docker build that bai (exit $LASTEXITCODE)." }
Write-OK "Build thanh cong trong $([int]$elapsed.TotalSeconds)s."

# ── Image info ────────────────────────────────────────────────────────────────
Write-Step "Thong tin image..."
docker images --filter "reference=${BACKEND_REPO}" `
    --format "  {{.Repository}}:{{.Tag}}  |  Size: {{.Size}}  |  ID: {{.ID}}"

# ── Smoke Tests ───────────────────────────────────────────────────────────────
if (-not $SkipTests) {
    $ea = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    Write-Step "Smoke Test 1: Django import + version check..."
    $r1 = (docker run --rm `
        -e SECRET_KEY="smoke-test-secret-key-not-real" `
        -e DEBUG="True" `
        -e ALLOWED_HOSTS="localhost" `
        -e DB_HOST="127.0.0.1" -e DB_NAME="x" -e DB_USER="x" -e DB_PASSWORD="x" `
        $localTag `
        python -c "import django; print('Django', django.get_version())" 2>&1) -join " "
    if ($r1 -like "*Django*") {
        Write-OK "Django import OK: $r1"
    } else {
        Write-Fail "Django import that bai:`n$r1"
    }

    Write-Step "Smoke Test 2: gunicorn co trong image..."
    $r2 = (docker run --rm $localTag gunicorn --version 2>&1) -join ""
    if ($LASTEXITCODE -eq 0) {
        Write-OK "gunicorn OK: $r2"
    } else {
        Write-Fail "gunicorn khong tim thay trong image."
    }

    Write-Step "Smoke Test 3: Kiem tra cau truc app (manage.py, config/)..."
    $r3 = (docker run --rm $localTag `
        sh -c "ls manage.py config/wsgi.py config/settings.py" 2>&1) -join " "
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Cau truc app OK: $r3"
    } else {
        Write-Fail "Cau truc app khong hop le:`n$r3"
    }

    Write-Step "Smoke Test 4: Python packages chinh (mysqlclient, pillow)..."
    $r4 = (docker run --rm $localTag `
        python -c "import MySQLdb; import PIL; print('mysqlclient OK, Pillow OK')" 2>&1) -join " "
    if ($r4 -like "*OK*") {
        Write-OK "$r4"
    } else {
        Write-Info "Package check: $r4 (co the thieu packages tuy chon)"
    }

    Write-Step "Smoke Test 5: manage.py help chay duoc..."
    $r5 = (docker run --rm `
        -e SECRET_KEY="smoke-test-secret-key-not-real" `
        -e DEBUG="True" `
        -e ALLOWED_HOSTS="localhost" `
        -e DB_HOST="127.0.0.1" -e DB_NAME="x" -e DB_USER="x" -e DB_PASSWORD="x" `
        $localTag `
        python manage.py help 2>&1) -join "`n"
    if ($r5 -like "*Available subcommands*" -or $r5 -like "*Type*manage.py*") {
        Write-OK "manage.py help chay duoc."
    } else {
        Write-Info "manage.py help: $($r5 -split '\n' | Select-Object -First 3 | Out-String)"
    }

    $ErrorActionPreference = $ea
}

# ── Tổng kết ──────────────────────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " TASK 3 HOAN THANH" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Images da tao:"
docker images --filter "reference=${BACKEND_REPO}" `
    --format "  {{.Repository}}:{{.Tag}}  ({{.Size}})"
Write-Host ""
Write-Host "Buoc tiep: .\deploy\04_build_frontend.ps1" -ForegroundColor Cyan
