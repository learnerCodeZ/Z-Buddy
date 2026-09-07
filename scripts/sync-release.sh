#!/usr/bin/env bash
# 构建发布版并同步到自启目录（~/.z-buddy/bin），杜绝"dev 是新的、自启是旧的"版本漂移。
# 注意：必须先停桌宠进程再覆盖 exe——Windows 不允许覆盖运行中的程序。
# 用法：bash scripts/sync-release.sh
set -e
cd "$(dirname "$0")/../app"

echo "[1/4] 构建发布版（exe + NSIS 安装包）..."
npx tauri build

echo "[2/4] 停止桌宠进程（解除 exe 占用）..."
taskkill //IM z-buddy-app.exe //F 2>/dev/null || true
sleep 1

echo "[3/4] 同步 exe 到 ~/.z-buddy/bin/ ..."
cp src-tauri/target/release/z-buddy-app.exe ~/.z-buddy/bin/z-buddy-app.exe

echo "[4/4] 重新启动桌宠..."
powershell -NoProfile -Command "Start-Process -FilePath \"\$env:USERPROFILE\.z-buddy\bin\z-buddy-app.exe\" -WindowStyle Hidden"

echo "✓ 完成：托盘/任务栏现在运行的是最新发布版（NSIS 安装包在 src-tauri/target/release/bundle/nsis/）"
