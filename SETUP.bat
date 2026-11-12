@echo off
title Prasanth's Performance Portal - Setup
echo.
echo ========================================
echo   Prasanth's Performance Portal - Setup
echo ========================================
echo.
echo This will:
echo   1. Check Node.js (only requirement)
echo   2. Set your admin password and port
echo   3. Install all dependencies
echo   4. Build the UI
echo.
echo   PostgreSQL is BUNDLED - nothing extra to install!
echo.

cd /d "%~dp0"

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please download and install Node.js v20 LTS from:
    echo   https://nodejs.org
    echo.
    echo After installing, run this setup again.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo Found Node.js %NODE_VER%

node scripts/setup.js

if errorlevel 1 (
    echo.
    echo [ERROR] Setup failed. See messages above.
    pause
    exit /b 1
)

echo.
echo All done! Run START.bat to launch the app.
pause
