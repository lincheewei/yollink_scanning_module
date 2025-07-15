@echo off
cd /d "%~dp0"

:: Check if package.json exists (confirm we're in the right folder)
if not exist package.json (
    echo ERROR: Not in project folder. package.json not found.
    pause
    exit /b
)

echo [Yollink] Starting dev server...
start /min cmd /k "npm run dev"

:: Wait for the dev server to be ready
timeout /t 8 >nul

:: Launch Chrome in kiosk mode
@REM start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "http://localhost:5173"

pause