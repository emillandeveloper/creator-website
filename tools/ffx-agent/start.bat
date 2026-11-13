@echo off
cd /d "%~dp0"
echo Twitch Chaos - Conector de Final Fantasy X
node --version >nul 2>&1
if errorlevel 1 (
  echo No se encuentra Node.js. Instala Node.js 22 LTS o superior.
  pause
  exit /b 1
)
if not exist ".env" (
  echo Falta el archivo .env. Consulta README.md para configurarlo.
  pause
  exit /b 1
)
node --env-file=.env agent.cjs
echo.
echo Conector cerrado.
pause
