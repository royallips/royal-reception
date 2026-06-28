# 出勤情報取得スクリプト（タスクスケジューラから実行）
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath
node scripts/fetch_attendance.js
