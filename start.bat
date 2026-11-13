@echo off
setlocal
cd /d "%~dp0"
echo Gupit Xpress - starting local server
set /p ADMIN_PASSCODE=Choose an admin passcode for this session: 
if "%ADMIN_PASSCODE%"=="" (echo A passcode is required. & pause & exit /b 1)
node server.js
pause
