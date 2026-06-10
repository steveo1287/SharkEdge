$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $repoRoot 'scripts\start_local_workers.ps1'
$taskName = 'SharkEdge Local Worker Supervisor'

if (-not (Test-Path $runnerPath)) {
  throw "Runner script not found: $runnerPath"
}

$taskCommand = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runnerPath + '"'

& cmd.exe /c ('schtasks.exe /Delete /TN "' + $taskName + '" /F >nul 2>&1')
& schtasks.exe /Create /TN $taskName /TR $taskCommand /SC MINUTE /MO 30 /F | Out-Null

Write-Host "Installed scheduled task: $taskName"
Write-Host "It checks every 30 minutes and starts the SharkEdge local worker supervisor if it is not already running."
