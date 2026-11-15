@echo off
title MAKE YOUR CPU
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Instaluji zavislosti, chvili to potrva...
  call npm install --no-audit --no-fund
  call node node_modules\electron\install.js
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0
