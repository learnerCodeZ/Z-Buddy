#!/usr/bin/env bash
# 构建发布版并同步到自启目录（~/.z-buddy/bin），杜绝"dev 是新的、自启是旧的"版本漂移。
# 用法：bash scripts/sync-release.sh
set -e
cd "$(dirname "$0")/../app"

echo "[1/3] 构建发布版（exe + NSIS 安装包）..."
npx tauri build

echo "[2/3] 同步 exe 到 ~/.z-buddy/bin/ ..."
cp src-tauri/target/release/z-buddy-app.exe ~/.z-buddy/bin/z-buddy-app.exe

echo "[3/3] 重启桌宠进程..."
taskkill //IM z-buddy-app.exe //F 2>/dev/null || true
sleep 1
powershell -NoProfile -Command "Start-Process -FilePath \"\$env:USERPROFILE\.z-buddy\bin\z-buddy-app.exe\" -WindowStyle Hidden"

echo "✓ 完成：托盘/任务栏现在运行的是最新发布版（NSIS 安装包在 src-tauri/target/release/bundle/nsis/）"
