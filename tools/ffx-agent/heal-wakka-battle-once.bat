@echo off
cd /d "%~dp0"
echo Twitch Chaos - PRUEBA REAL: curar 100 HP a Wakka EN COMBATE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0heal-wakka-battle-once.ps1"
echo.
pause
