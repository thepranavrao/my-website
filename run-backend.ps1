# POSH Compass — one-shot backend launcher (Windows PowerShell)
# Creates a virtualenv, installs deps, and starts the API + site on :8000
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$venv = Join-Path $root "backend\.venv"
$py   = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $py)) {
  Write-Host "Creating virtualenv..." -ForegroundColor Cyan
  python -m venv $venv
  & $py -m pip install --upgrade pip
  & $py -m pip install -r (Join-Path $root "backend\requirements.txt")
}

Write-Host "Starting POSH Compass on http://localhost:8000 ..." -ForegroundColor Green
Set-Location $root
& $py -m uvicorn backend.app:app --port 8000
