$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path '.venv')) {
  python -m venv .venv
}

. .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install requests oddsharvester

while ($true) {
  Write-Host "`n[$(Get-Date -Format s)] Running local OddsHarvester push..."
  python .\scripts\local_oddsharvester_push.py

  Write-Host "Sleeping 15 minutes..."
  Start-Sleep -Seconds 900
}
