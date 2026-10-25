#!/usr/bin/env bash
# 本地一键校验：类型检查 → 单元测试 → 生产构建
# 用法：bash scripts/verify.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> [1/3] 类型检查"
npm run typecheck

echo "==> [2/3] 单元测试"
npm test

echo "==> [3/3] 生产构建"
npm run build

echo
echo "全部通过。产物：main.js / manifest.json / styles.css"
ls -lh main.js manifest.json styles.css
