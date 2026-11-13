@echo off
cd /d "%~dp0"
echo Twitch Chaos - FFX HD (lectura solamente)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0inspect-inventory.ps1"
echo.
pause
