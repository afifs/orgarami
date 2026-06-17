@echo off
cd /d "%~dp0"

:: Check if node_modules exists, install if not
if not exist "node_modules\" (
    echo Installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. Make sure Node.js is installed.
        echo Download from: https://nodejs.org
        pause
        exit /b 1
    )
)

:: Launch the app (window stays hidden after launch)
start "" npx electron .
