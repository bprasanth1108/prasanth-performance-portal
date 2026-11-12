@echo off
title Prasanth's Performance Portal
echo.
echo ========================================
echo   Prasanth's Performance Portal
echo ========================================
echo.

cd /d "%~dp0"

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Download from https://nodejs.org
    pause
    exit /b 1
)

:: First-run check
if not exist "backend\node_modules" (
    echo [INFO] First run detected - running setup...
    echo.
    node scripts/setup.js
    if errorlevel 1 (
        echo [ERROR] Setup failed.
        pause
        exit /b 1
    )
)

echo PostgreSQL: embedded and starting automatically...
echo.
echo Open your browser at: https://localhost:3443
echo Others on your network: https://%COMPUTERNAME%:3443
echo (No port number needed if port forwarding is set up: scripts\setup-ports.ps1)
echo.
echo Press Ctrl+C to stop.
echo ========================================
echo.

node backend/src/app.js

pause
