# =============================================================================
# deploy/08_ecr_lifecycle.ps1
# Task 8: Setup ECR lifecycle policies
#
# Policy rules (ap dung cho ca backend lan frontend repo):
#   Rule 1 [priority 1] - Giu toi da 10 date-tagged images (prefix "202x")
#   Rule 2 [priority 2] - Xoa untagged images sau 1 ngay
#   Tag "latest" duoc bao ve tu dong (khong match rule nao)
#
# Cach dung:
#   .\deploy\08_ecr_lifecycle.ps1
#   .\deploy\08_ecr_lifecycle.ps1 -DryRun
#   .\deploy\08_ecr_lifecycle.ps1 -MaxDateTags 5
# =============================================================================

param(
    [switch]$DryRun,
    [int]$MaxDateTags = 10
)

. "$PSScriptRoot\config.ps1"
$ErrorActionPreference = "Stop"

Write-Banner "TASK 8: Setup ECR Lifecycle Policies"

# -- Tao lifecycle policy JSON -------------------------------------------------
# NOTE: Tag "latest" duoc bao ve tu dong vi khong match bat ky rule nao.
# Chi target: date-tagged (prefix "202") va untagged images.
# Dung raw JSON string de dam bao dung thu tu fields + khong bi loi format.
$policyJson = @"
{"rules":[{"rulePriority":1,"description":"Giu toi da $MaxDateTags date-tagged images (prefix 202)","selection":{"tagStatus":"tagged","tagPrefixList":["202"],"countType":"imageCountMoreThan","countNumber":$MaxDateTags},"action":{"type":"expire"}},{"rulePriority":2,"description":"Xoa untagged images sau 1 ngay","selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countUnit":"days","countNumber":1},"action":{"type":"expire"}}]}
"@

# -- Hien thi policy ----------------------------------------------------------
Write-Step "Lifecycle Policy se ap dung:"
Write-Host $policyJson -ForegroundColor DarkGray

Write-Host ""
Write-Host "Tong ket rules:" -ForegroundColor Yellow
Write-Host "  Rule 1 [priority=1] : tag prefix '202...' - giu toi da $MaxDateTags"
Write-Host "  Rule 2 [priority=2] : untagged            - xoa sau 1 ngay"
Write-Host "  (Tag 'latest' duoc bao ve vi khong match rule nao)" -ForegroundColor DarkGray

if ($DryRun) {
    Write-Host "`n[DRY RUN] Policy KHONG duoc apply. Bo -DryRun de ap dung that." -ForegroundColor Yellow
    exit 0
}

# -- MFA + credentials ---------------------------------------------------------
Write-Step "Xac thuc MFA..."
$creds = Get-MFACredentials
Set-AWSSession $creds
Write-OK "Temporary credentials OK."

# -- Helper: apply + verify policy cho 1 repo ---------------------------------
function Apply-Policy([string]$repoName) {
    Write-Step "Apply lifecycle policy cho: $repoName"

    # Kiem tra repo ton tai
    $ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $null = aws ecr describe-repositories --repository-names $repoName --region $REGION 2>&1
    $ec = $LASTEXITCODE
    $ErrorActionPreference = $ea

    if ($ec -ne 0) {
        Write-Info "Repo '$repoName' chua ton tai - bo qua (chay Task 1 truoc)."
        return
    }

    # Ghi policy JSON ra file tam KHONG co BOM (UTF8 thuan)
    $tmpFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmpFile, $policyJson, (New-Object System.Text.UTF8Encoding $false))

    # Apply policy dung file://
    $ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $result = (aws ecr put-lifecycle-policy `
        --repository-name $repoName `
        --lifecycle-policy-text "file://$tmpFile" `
        --region $REGION 2>&1) -join "`n"
    $ec = $LASTEXITCODE
    $ErrorActionPreference = $ea

    # Xoa file tam
    Remove-Item $tmpFile -ErrorAction SilentlyContinue

    if ($ec -ne 0) {
        Write-Info "Error: $result"
        Write-Fail "put-lifecycle-policy that bai cho $repoName."
    }
    Write-OK "Policy applied cho: $repoName"

    # Verify: doc lai policy tu ECR
    $ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $applied = (aws ecr get-lifecycle-policy `
        --repository-name $repoName `
        --region $REGION `
        --query "lifecyclePolicyText" `
        --output text 2>&1) -join ""
    $ec = $LASTEXITCODE
    $ErrorActionPreference = $ea

    if ($ec -eq 0) {
        try {
            $parsed = $applied | ConvertFrom-Json
            $ruleCount = $parsed.rules.Count
            Write-OK "Verified: $ruleCount rules da luu tren ECR."
        } catch {
            Write-OK "Verified: policy da luu."
        }
    }
}

# -- Apply cho ca 2 repos ------------------------------------------------------
Apply-Policy $BACKEND_REPO
Apply-Policy $FRONTEND_REPO

# -- Snapshot images hien tai ---------------------------------------------------
Write-Step "Images hien tai tren ECR..."
$ea = $ErrorActionPreference; $ErrorActionPreference = "Continue"
foreach ($repo in @($BACKEND_REPO, $FRONTEND_REPO)) {
    Write-Host "`n  [$repo]" -ForegroundColor Yellow
    $imgs = aws ecr describe-images `
        --repository-name $repo --region $REGION `
        --query "sort_by(imageDetails, &imagePushedAt)[*].{Tags:imageTags[0],Pushed:imagePushedAt}" `
        --output table 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host $imgs
    } else {
        Write-Info "Chua co images hoac khong truy cap duoc."
    }
}
$ErrorActionPreference = $ea

# -- Tong ket -------------------------------------------------------------------
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " TASK 8 HOAN THANH" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Lifecycle policy da apply cho:"
Write-Host "  $REGISTRY/$BACKEND_REPO"
Write-Host "  $REGISTRY/$FRONTEND_REPO"
Write-Host ""
Write-Host "Luu y:" -ForegroundColor Yellow
Write-Host "  - Lifecycle rules chay 1 lan/ngay theo schedule cua AWS"
Write-Host "  - Untagged images se bi xoa sau 24h tiep theo"
Write-Host "  - Date tags cu (qua $MaxDateTags ban) se bi xoa theo luot"
Write-Host ""
Write-Host "Xem tren Console:" -ForegroundColor Cyan
Write-Host "  https://$REGION.console.aws.amazon.com/ecr/repositories/$BACKEND_REPO"

Clear-AWSSession
