$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

while ($true) {
  Write-Host "`n[$(Get-Date -Format s)] Running local OddsHarvester push..."
  & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\run_local_oddsharvester_once.ps1')

  Write-Host 'Sleeping 15 minutes...'
  Start-Sleep -Seconds 900
}
