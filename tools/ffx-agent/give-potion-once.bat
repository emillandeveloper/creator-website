@echo off
cd /d "%~dp0"
echo Twitch Chaos - PRUEBA REAL: sumar UNA Pocion a FFX
echo Usa un slot de guardado separado para esta prueba.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0give-potion-once.ps1"
echo.
pause
