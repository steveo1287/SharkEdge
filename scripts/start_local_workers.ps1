$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$lockPath = Join-Path $repoRoot '.local-workers-supervisor.lock'
if (Test-Path $lockPath) {
  $existingPid = (Get-Content $lockPath -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($existingPid -and ($existingPid -match '^\d+$')) {
    $existing = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
    if ($existing) {
      Write-Host "SharkEdge local worker supervisor already running as PID $existingPid."
      exit 0
    }
  }
  Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}

Set-Content -Path $lockPath -Value $PID -Encoding ASCII

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
$env:SHARKEDGE_DISABLE_WORKERS = 'false'
$env:ALLOW_RAILWAY_HEAVY_WORKER = 'false'

Write-Host 'Starting SharkEdge local worker supervisor...'
try {
  & npm run workers:local:supervise
} finally {
  Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}
