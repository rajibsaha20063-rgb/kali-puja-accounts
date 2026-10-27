@echo off
title NEIGHBOURHOOD CLUB - Kali Puja 2026 (Local Server + Free Public Online Link)
color 0B

echo ======================================================================
echo    NEIGHBOURHOOD CLUB - KALI PUJA 2026 ACCOUNTS ^& AUDIT PORTAL
echo       (Running on Your PC with Free Public Internet Access)
echo ======================================================================
echo.
cd /d "%~dp0"

echo [1/2] Launching local server on your PC (port 3000)...
start "Kali Puja Local Server" cmd /k "node server.js"

timeout /t 3 /nobreak >nul

echo [2/2] Generating secure public web link for mobile access...
echo.
echo ----------------------------------------------------------------------
echo Anyone anywhere on any mobile network can use this public link!
echo All data stays 100%% permanently stored on YOUR computer's hard drive.
echo ----------------------------------------------------------------------
echo.

start http://localhost:3000
npx localtunnel --port 3000
pause
