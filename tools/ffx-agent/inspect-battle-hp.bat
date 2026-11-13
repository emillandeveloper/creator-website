@echo off
cd /d "%~dp0"
echo Twitch Chaos - FFX HP EN COMBATE (SOLO LECTURA)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0inspect-battle-hp.ps1"
echo.
pause
