@echo off
cd /d "%~dp0"
echo Twitch Chaos - FFX HP (solo lectura)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0inspect-hp.ps1"
echo.
pause
