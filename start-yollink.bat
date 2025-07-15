@echo off
set LOG=%TEMP%\yollink-startup.log
echo [%date% %time%] Script started > "%LOG%"
cd /d "%~dp0" || echo [%date% %time%] Failed to cd >> "%LOG%"

if not exist package.json (
    echo [%date% %time%] ERROR: package.json not found >> "%LOG%"
    exit /b
)

echo [%date% %time%] Starting npm dev >> "%LOG%"
start /min cmd /k "npm run dev"

timeout /t 8 >nul
echo [%date% %time%] Launching Chrome >> "%LOG%"
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "http://localhost:5173"

echo [%date% %time%] Script ended >> "%LOG%"