@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 슬터디 서버
start "" cmd /c "timeout /t 1 >nul & start http://localhost:5173"
node server.mjs
pause
