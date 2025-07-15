@echo off
set LOG=%TEMP%\yollink-startup.log
echo [%date% %time%] Script started > "%LOG%"

:: Navigate to script folder
cd /d "%~dp0" || (
    echo [%date% %time%] Failed to cd >> "%LOG%"
    pause
    exit /b
)

:: Verify package.json
if not exist package.json (
    echo [%date% %time%] ERROR: package.json not found >> "%LOG%"
    pause
    exit /b
)

:: Start npm run dev using full path to npm
echo [%date% %time%] Starting npm dev >> "%LOG%"
start /min cmd /k "cd /d \"%~dp0\" && \"C:\Program Files\nodejs\npm.cmd\" run dev >> %TEMP%\yollink-npm.log 2>&1"

:: Wait 8 seconds before launching Chrome
timeout /t 8 >nul

:: Launch Chrome in kiosk mode
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist %CHROME_PATH% (
    echo [%date% %time%] Launching Chrome >> "%LOG%"
    start "" %CHROME_PATH% --kiosk "http://localhost:5173"
) else (
    echo [%date% %time%] Chrome not found at %CHROME_PATH% >> "%LOG%"
)

:: End
echo [%date% %time%] Script ended >> "%LOG%"