# 出勤情報取得スクリプト（タスクスケジューラから実行）
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

$logFile = Join-Path $scriptPath "attendance_log.txt"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$timestamp] 実行開始" | Out-File -FilePath $logFile -Append -Encoding UTF8

node scripts/fetch_attendance.js 2>&1 | Tee-Object -FilePath $logFile -Append

$exitCode = $LASTEXITCODE
"[$timestamp] 終了コード: $exitCode" | Out-File -FilePath $logFile -Append -Encoding UTF8

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "エラーが発生しました。attendance_log.txt を確認してください。" -ForegroundColor Red
    Write-Host "Enterキーを押して閉じます..."
    Read-Host
}
