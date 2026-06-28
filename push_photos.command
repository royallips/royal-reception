#!/bin/bash
cd "$(dirname "$0")"

echo "写真の変更を確認中..."

git add img/

if git diff --staged --quiet; then
  echo "追加・変更された写真はありません。"
else
  COUNT=$(git diff --staged --name-only img/ | wc -l | tr -d ' ')
  git commit -m "写真を追加・更新 (${COUNT}枚)"
  git push
  echo ""
  echo "✓ ${COUNT}枚の写真をアップロードしました。"
fi

echo ""
echo "このウィンドウを閉じてください。"
read
