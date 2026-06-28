# POSH Compass — one-shot backend launcher (Windows PowerShell)
# Installs deps (if needed) and starts the API + site on :8000
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  Push-Location $root
  npm install
  Pop-Location
}

Write-Host "Starting POSH Compass on http://localhost:8000 ..." -ForegroundColor Green
Push-Location $root
node backend/server.js
Pop-Location
