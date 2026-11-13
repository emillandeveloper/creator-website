@echo off
cd /d "%~dp0"
echo Twitch Chaos - PRUEBA REAL: curar 100 HP a Wakka
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0heal-wakka-once.ps1"
echo.
pause
