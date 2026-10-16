#!/bin/bash
# GitHub のトークンを Mac のキーチェーンに保存する（1回だけ実行。以降の git push はパスワード入力なし）
# 使い方: 先に GitHub のトークン（github_pat_ で始まる文字列）をコピーしてから、次を実行
#   bash scripts/github-login.sh
set -euo pipefail
USER_NAME="ahouprojectmaimai-beep"
TOKEN="$(pbpaste | tr -d '[:space:]')"
case "$TOKEN" in
  github_pat_*|ghp_*) ;;
  *) echo "コピーした内容が GitHub のトークンではありません（github_pat_ で始まる文字列をコピーしてください）。" >&2; exit 1 ;;
esac
printf 'protocol=https\nhost=github.com\nusername=%s\npassword=%s\n\n' "$USER_NAME" "$TOKEN" | git credential approve
echo "保存しました。確認します…"
if git ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
  echo "OK: GitHub に接続できました。今後は git push だけで反映できます。"
else
  echo "接続できませんでした。トークンの権限（Contents: Read and write）と対象リポジトリを確認してください。" >&2
  exit 1
fi
