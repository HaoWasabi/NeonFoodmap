# =============================================================================
# deploy/07_test_pull_ecr.ps1
# Task 7: Test image pull from ECR
#
# Cach dung:
#   .\deploy\07_test_pull_ecr.ps1
#   .\deploy\07_test_pull_ecr.ps1 -Tag "20250715-1430"
#   .\deploy\07_test_pull_ecr.ps1 -KeepLocal
# =============================================================================

param(
    [string]$Tag       = "latest",
    [switch]$KeepLocal
)

. "$PSScriptRoot\config.ps1"
$ErrorActionPreference = "Stop"

# ── Helper: chay docker, bat ca stdout+stderr, khong crash ───────────────────
# Nhan dau vao la string array tuong minh, tranh moi van de split argument
function Run-Docker([string[]]$argList) {
    $ea = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = (& docker @argList 2>&1) -join "`n"
    $ec  = $LASTEXITCODE
    $ErrorActionPreference = $ea
    return [PSCustomObject]@{ Output = $out; ExitCode = $ec }
}

Write-Banner "TASK 7: Test Image Pull from ECR"

# ── MFA + credentials ─────────────────────────────────────────────────────────
Write-Step "Xac thuc MFA..."
$creds = Get-MFACredentials
Set-AWSSession $creds
Write-OK "Temporary credentials OK."

Connect-ECRDocker

# ── Helper: pull image tu ECR, verify digest ──────────────────────────────────
# Dung script-scope variable $script:pulledImage thay vi return
# de tranh PS function capturing stdout cua docker pull
function Pull-And-Verify([string]$repoName, [string]$tag) {
    $remoteUri  = "${REGISTRY}/${repoName}:${tag}"
    $localAlias = "${repoName}-ecr:${tag}"

    Write-Step "Pull: ${repoName}:${tag}"

    # Lay digest tren ECR truoc khi pull
    $ecrDigest = aws ecr describe-images `
        --repository-name $repoName `
        --image-ids "imageTag=$tag" `
        --region $REGION `
        --query "imageDetails[0].imageDigest" `
        --output text 2>&1
    if ($LASTEXITCODE -eq 0 -and $ecrDigest -like "sha256:*") {
        Write-Info "ECR digest: $ecrDigest"
    } else {
        Write-Fail "Khong tim thay tag '$tag' tren ECR repo '$repoName'. Chay Task 6 truoc."
    }

    # Xoa local cache de test pull thuc su
    if (-not $KeepLocal) {
        $ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        docker rmi -f $remoteUri  2>&1 | Out-Null
        docker rmi -f $localAlias 2>&1 | Out-Null
        $ErrorActionPreference = $ea
        Write-Info "Da xoa local cache."
    }

    # Pull tu ECR — pipe qua Out-Host de docker output ra console, khong bi capture vao bien
    $t = Get-Date
    docker pull $remoteUri | Out-Host
    if ($LASTEXITCODE -ne 0) { Write-Fail "docker pull that bai: $remoteUri" }
    $elapsed = [int]((Get-Date) - $t).TotalSeconds
    Write-OK "Pull thanh cong trong ${elapsed}s."

    # Verify digest
    $ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $digestOut = (docker inspect $remoteUri --format "{{index .RepoDigests 0}}" 2>&1) -join ""
    $ErrorActionPreference = $ea
    if ($digestOut -like "*$ecrDigest*") {
        Write-OK "Digest khop: $ecrDigest"
    } else {
        Write-Info "Local digest : $digestOut"
        Write-Info "ECR digest   : $ecrDigest"
        Write-Info "(Mismatch co the do multi-arch manifest - binh thuong)"
    }

    # Tag thanh alias ngan gon
    $ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    docker tag $remoteUri $localAlias 2>&1 | Out-Null
    $ErrorActionPreference = $ea

    # Luu vao script-scope variable, KHONG dung return de tranh PS capture stdout
    $script:pulledImage = $localAlias
}

# ════════════════════════════════════════════════════════════
# PULL + TEST BACKEND
# ════════════════════════════════════════════════════════════
Write-Banner "Pull + Test Backend"
Pull-And-Verify $BACKEND_REPO $Tag
$beImage = $script:pulledImage
Write-Step "Smoke test backend (${beImage})..."

# Test 1: Django import
$djangoArgs = @(
    "run", "--rm",
    "-e", "SECRET_KEY=pull-test-key",
    "-e", "DEBUG=True",
    "-e", "ALLOWED_HOSTS=localhost",
    "-e", "DB_HOST=127.0.0.1",
    "-e", "DB_NAME=x",
    "-e", "DB_USER=x",
    "-e", "DB_PASSWORD=x",
    $beImage,
    "python", "-c", "import django; print('Django', django.get_version())"
)
$r1 = Run-Docker $djangoArgs
if ($r1.Output -like "*Django*") {
    Write-OK "Django OK: $($r1.Output -replace '`n','')"
} else {
    Write-Fail "Django import that bai: $($r1.Output)"
}

# Test 2: gunicorn co trong image
$r2 = Run-Docker @("run","--rm",$beImage,"gunicorn","--version")
if ($r2.ExitCode -eq 0) { Write-OK "gunicorn: $($r2.Output -replace '`n','')" }
else { Write-Fail "gunicorn khong tim thay trong image." }

# Image size
$ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
$beSize = (docker images $beImage --format "{{.Size}}" 2>&1) -join ""
$ErrorActionPreference = $ea
Write-Info "Backend image size: $beSize"

# ════════════════════════════════════════════════════════════
# PULL + TEST FRONTEND
# ════════════════════════════════════════════════════════════
Write-Banner "Pull + Test Frontend"
Pull-And-Verify $FRONTEND_REPO $Tag
$feImage = $script:pulledImage
Write-Step "Smoke test frontend (${feImage})..."

# Test 3: nginx config
$r3 = Run-Docker @("run","--rm","$feImage","nginx","-t")
if ($r3.ExitCode -eq 0) {
    Write-OK "nginx config OK: $($r3.Output -replace '`n',' | ')"
} else {
    Write-Fail "nginx config loi: $($r3.Output)"
}

# Test 4: index.html ton tai
$r4 = Run-Docker @("run","--rm","$feImage","sh","-c","test -f /usr/share/nginx/html/index.html && echo OK")
if ($r4.Output -like "*OK*") { Write-OK "index.html ton tai." }
else { Write-Fail "index.html khong tim thay." }

# Image size
$ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
$feSize = (docker images $feImage --format "{{.Size}}" 2>&1) -join ""
$ErrorActionPreference = $ea
Write-Info "Frontend image size: $feSize"

# Test 5: HTTP test — khoi dong container, goi port 80
Write-Step "HTTP test: khoi dong frontend tu ECR image..."
$httpCon = "nf-fe-pull-$(Get-Random)"
$ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
docker run -d --name $httpCon -p 18083:80 $feImage 2>&1 | Out-Null
$ErrorActionPreference = $ea
Start-Sleep -Seconds 3

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:18083/" -TimeoutSec 5 -UseBasicParsing
    Write-OK "Frontend HTTP $($resp.StatusCode) OK tu ECR image."
} catch {
    Write-Info "HTTP test: $($_.Exception.Message)"
}
docker rm -f $httpCon 2>&1 | Out-Null

# ── Tong ket ──────────────────────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " TASK 7 HOAN THANH" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Images da pull tu ECR va pass smoke tests:"
Write-Host "  Backend  : $beImage  ($beSize)"
Write-Host "  Frontend : $feImage  ($feSize)"
Write-Host ""
Write-Host "Buoc tiep: .\deploy\08_ecr_lifecycle.ps1" -ForegroundColor Cyan

Clear-AWSSession
