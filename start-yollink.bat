@echo off
setlocal

set LOG=%TEMP%\yollink-startup.log
echo [%date% %time%] Script started > "%LOG%"

:: Go to this script's directory
cd /d "%~dp0" || (
    echo [%date% %time%] Failed to cd to script folder >> "%LOG%"
    exit /b
)

:: Check if package.json exists
if not exist package.json (
    echo [%date% %time%] ERROR: package.json not found >> "%LOG%"
    exit /b
)

:: Start npm run dev (log output separately)
echo [%date% %time%] Starting npm dev >> "%LOG%"
start "" /min cmd /k "cd /d \"%~dp0\" && \"C:\Program Files\nodejs\npm.cmd\" run dev >> \"%TEMP%\yollink-npm.log\" 2>&1"

:: Wait before opening browser
timeout /t 8 >nul

:: Launch Chrome in kiosk mode
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "%CHROME_PATH%" (
    echo [%date% %time%] Launching Chrome >> "%LOG%"
    start "" "%CHROME_PATH%" --kiosk "http://localhost:5173"
) else (
    echo [%date% %time%] Chrome not found at %CHROME_PATH% >> "%LOG%"
)

echo [%date% %time%] Script ended >> "%LOG%"
endlocal