$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$envFile = Join-Path $repoRoot '.env.local-workers'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $parts = $line.Split('=', 2)
    if ($parts.Length -eq 2) {
      [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim())
    }
  }
}

$env:SHARKEDGE_WORKER_MODE = 'local'
$env:ALLOW_RAILWAY_HEAVY_WORKER = 'false'
$env:SHARKEDGE_DISABLE_WORKERS = 'false'

Write-Host 'Running local sim-worker once...'
& npm run worker:sim:local
