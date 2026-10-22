@echo off
chcp 65001 >nul
rem 光国桌宠 · 手动启动（开发/调试用；正常由 Codex 通过 MCP 拉起）
cd /d "%~dp0plugin"
if not exist "src\launch.js" (
  echo 找不到 plugin\src\launch.js，确认项目结构。
  pause
  exit /b 1
)
start "" node src\launch.js
echo 已启动。姿态与相位日志：%APPDATA%\guangguo-pet\status.json / activity.json
timeout /t 3 >nul
