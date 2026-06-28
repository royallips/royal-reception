# 出勤情報をシティヘブンから取得してGitHubにpushするスクリプト
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "出勤情報を取得中..."
node scripts/fetch_attendance.js

git add attend.json
$diff = git diff --staged --name-only
if ($diff) {
    git commit -m "Update attendance [skip ci]"
    git push origin main
    Write-Host "GitHubに反映しました"
} else {
    Write-Host "変更なし"
}
