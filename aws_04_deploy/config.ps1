# =============================================================================
# deploy/config.ps1 — Cấu hình chung cho tất cả deploy scripts
# Import bằng:  . "$PSScriptRoot\config.ps1"
# =============================================================================

# ── AWS ───────────────────────────────────────────────────────────────────────
$ACCOUNT_ID  = "497172038341"
$REGION      = "ap-southeast-1"
$REGISTRY    = "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
$MFA_SERIAL  = "arn:aws:iam::${ACCOUNT_ID}:mfa/VivoAuth-Work"

# ── ECR repo names ────────────────────────────────────────────────────────────
$BACKEND_REPO  = "neonfoodmap-backend"
$FRONTEND_REPO = "neonfoodmap-frontend"

# ── Image tags ────────────────────────────────────────────────────────────────
$IMAGE_TAG  = "latest"
$DATE_TAG   = (Get-Date -Format "yyyyMMdd-HHmm")   # e.g. 20250715-1430

# ── Local paths ───────────────────────────────────────────────────────────────
$ROOT_DIR     = Split-Path $PSScriptRoot -Parent
$BACKEND_DIR  = Join-Path $ROOT_DIR "backend"
$FRONTEND_DIR = Join-Path $ROOT_DIR "frontend"

# ── Shared helper functions ───────────────────────────────────────────────────
function Write-Step([string]$msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}
function Write-OK([string]$msg) {
    Write-Host "    [OK] $msg" -ForegroundColor Green
}
function Write-Fail([string]$msg) {
    Write-Host "`n[FAIL] $msg" -ForegroundColor Red
    exit 1
}
function Write-Info([string]$msg) {
    Write-Host "    [INFO] $msg" -ForegroundColor Yellow
}
function Write-Banner([string]$msg) {
    $line = "-" * 50
    Write-Host "`n$line" -ForegroundColor Magenta
    Write-Host " $msg" -ForegroundColor Magenta
    Write-Host "$line" -ForegroundColor Magenta
}

# ── Get MFA session token via boto3 (returns PSCustomObject with AWS creds) ──
function Get-MFACredentials {
    # Xoa session credentials cu neu con ton tai trong env vars
    # (GetSessionToken khong the goi tu session credentials)
    if ($env:AWS_SESSION_TOKEN) {
        Write-Info "Phat hien session credentials trong env vars, dang xoa truoc khi lay MFA token..."
        $env:AWS_ACCESS_KEY_ID     = ""
        $env:AWS_SECRET_ACCESS_KEY = ""
        $env:AWS_SESSION_TOKEN     = ""
    }

    $code = Read-Host "Nhap ma MFA tu Authenticator app"

    $py = @"
import boto3, json, sys
try:
    sts = boto3.client('sts')
    r = sts.get_session_token(SerialNumber='$MFA_SERIAL', TokenCode='$code')
    c = r['Credentials']
    print(json.dumps({'AKI': c['AccessKeyId'], 'SAK': c['SecretAccessKey'], 'ST': c['SessionToken']}))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
"@

    $json = $py | python
    if ($LASTEXITCODE -ne 0) { Write-Fail "Lay session token that bai. Kiem tra lai ma MFA." }

    $c = $json | ConvertFrom-Json
    return $c
}

# ── Set / Clear temporary AWS env vars ────────────────────────────────────────
function Set-AWSSession([PSCustomObject]$c) {
    $env:AWS_ACCESS_KEY_ID     = $c.AKI
    $env:AWS_SECRET_ACCESS_KEY = $c.SAK
    $env:AWS_SESSION_TOKEN     = $c.ST
    $env:AWS_DEFAULT_REGION    = $REGION
}
function Clear-AWSSession {
    $env:AWS_ACCESS_KEY_ID     = ""
    $env:AWS_SECRET_ACCESS_KEY = ""
    $env:AWS_SESSION_TOKEN     = ""
}

# ── ECR Docker login (requires AWS session vars set) ─────────────────────────
function Connect-ECRDocker {
    Write-Step "Dang nhap Docker vao ECR ($REGISTRY)..."
    $pwd = aws ecr get-login-password --region $REGION
    if ($LASTEXITCODE -ne 0) { Write-Fail "Khong lay duoc ECR login password." }
    $pwd | docker login --username AWS --password-stdin $REGISTRY
    if ($LASTEXITCODE -ne 0) { Write-Fail "docker login vao ECR that bai." }
    Write-OK "Dang nhap ECR thanh cong."
}
