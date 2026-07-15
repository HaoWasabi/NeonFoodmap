# =============================================================================
# deploy/run_all.ps1
# Chạy toàn bộ 8-task pipeline theo thứ tự
#
# Cách dùng:
#   .\deploy\run_all.ps1
#   .\deploy\run_all.ps1 -ViteApiUrl "http://YOUR_EC2_IP/api"
#   .\deploy\run_all.ps1 -StartFrom 5   # bỏ qua task 1-4, bắt đầu từ task 5
# =============================================================================

param(
    [string]$ViteApiUrl        = "http://localhost:8000/api",
    [string]$VitePaypalClientId = "",
    [int]$StartFrom             = 1
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

function Run-Task([int]$num, [string]$name, [scriptblock]$block) {
    if ($num -lt $StartFrom) {
        Write-Host "`n[SKIP] Task $num: $name" -ForegroundColor DarkGray
        return
    }
    Write-Banner "TASK $num / 8: $name"
    & $block
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
        Write-Host "`n[FAIL] Task $num that bai." -ForegroundColor Red
        exit 1
    }
    Write-Host "`n[DONE] Task $num hoan thanh." -ForegroundColor Green
}

Run-Task 1 "Create ECR Repositories"         { & "$PSScriptRoot\01_create_ecr_repos.ps1" }
Run-Task 2 "Test ECR Login"                  { & "$PSScriptRoot\02_test_ecr_login.ps1" }
Run-Task 3 "Build Backend Image"             { & "$PSScriptRoot\03_build_backend.ps1" }
Run-Task 4 "Build Frontend Image"            { & "$PSScriptRoot\04_build_frontend.ps1" -ViteApiUrl $ViteApiUrl -VitePaypalClientId $VitePaypalClientId }
Run-Task 5 "Test Builds Locally"             { & "$PSScriptRoot\05_test_builds_local.ps1" }
Run-Task 6 "Push Images to ECR"              { & "$PSScriptRoot\06_push_ecr.ps1" }
Run-Task 7 "Test Pull from ECR"              { & "$PSScriptRoot\07_test_pull_ecr.ps1" }
Run-Task 8 "Setup ECR Lifecycle Policies"    { & "$PSScriptRoot\08_ecr_lifecycle.ps1" }

Write-Host "`n" + ("=" * 50) -ForegroundColor Green
Write-Host " TAT CA 8 TASKS HOAN THANH" -ForegroundColor Green
Write-Host ("=" * 50) -ForegroundColor Green
