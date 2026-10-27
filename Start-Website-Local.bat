@echo off
title NEIGHBOURHOOD CLUB - Kali Puja 2026 Accounts Server
color 0E

echo ======================================================================
echo    NEIGHBOURHOOD CLUB - KALI PUJA 2026 ACCOUNTS ^& AUDIT PORTAL
echo ======================================================================
echo.
echo [1/3] Checking environment...
cd /d "%~dp0"

echo [2/3] All data is permanently saved on this PC in:
echo       - Users: users.json
echo       - Settings ^& Webhook: settings.json
echo       - Collections: contributors.json
echo       - Expenses: data-store.json
echo       * Your data will NEVER vanish or get wiped!
echo.

echo [3/3] Starting server on http://localhost:3000 ...
echo.
echo ----------------------------------------------------------------------
echo  ACCESS ON THIS PC:
echo    http://localhost:3000
echo.
echo  ACCESS FROM MOBILE / OTHER DEVICES ON SAME WI-FI:
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0.*0.0.0.0') do (
    set LOCAL_IP=%%a
)
echo    http://10.214.163.220:3000
echo ----------------------------------------------------------------------
echo.
echo Opening browser...
start http://localhost:3000

echo.
echo Server is running live! Keep this window open while using the website.
echo Press Ctrl + C anytime to stop the server.
echo ======================================================================
echo.

node server.js
pause
