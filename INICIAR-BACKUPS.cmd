@echo off
cd /d "%~dp0"
if not exist "private-backups\admin-generator\local-service.env" (
  echo Primero ejecutar: node scripts/setup-local-backup-service.mjs
  exit /b 1
)
node scripts/local-backup-service.mjs %*
