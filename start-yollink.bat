@echo off
cd /d "%~dp0"

:: Check if we're in the project folder
if not exist package.json (
    echo ERROR: Not in project folder. package.json not found.
    pause
    exit /b
)

echo [Yollink] Starting dev server...
start /min cmd /k "npm run dev"

timeout /t 20 >nul   :: ⬅ Increase wait to 20 seconds


:: Launch Chrome in kiosk mode
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "http://localhost:5173"