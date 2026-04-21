$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$envFile = Join-Path $repoRoot '.env.local-oddsharvester'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) {
      return
    }
    $parts = $line.Split('=', 2)
    if ($parts.Length -eq 2) {
      [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim())
    }
  }
}

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
