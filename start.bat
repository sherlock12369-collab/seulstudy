@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 슬터디 서버
rem 1) 인터넷 통로(터널)를 따로 창에서 켜고 새 주소를 GitHub 사이트에 알린다 (cloudflared 필요)
start "슬터디 터널" cmd /c "node tools\tunnel.mjs & pause"
rem 2) 이 컴퓨터에서 바로 열기
start "" cmd /c "timeout /t 1 >nul & start http://localhost:5173"
rem 3) 서버 (이 창을 닫으면 서버가 꺼져요)
node server.mjs
pause
