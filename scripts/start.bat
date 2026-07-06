@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."

cd /d "%PROJECT_DIR%"

node --version >nul 2>&1
if errorlevel 1 (
  echo Error: Node.js is not installed. Please install Node.js 18+ first.
  exit /b 1
)

if not exist "node_modules\*" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "web\dist\*" (
  echo Building project...
  call npm run build
  if errorlevel 1 exit /b 1
)

:: Environment variables (HOST, PORT, MIMO_HOST, MIMO_PORT, AUTH_TOKEN) are passed through automatically.
if defined AUTH_TOKEN (
  echo [start] AUTH_TOKEN is set; authentication enabled
)

echo Starting MiMo Code WebUI...
call npm start
