$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $repoRoot 'scripts\run_local_sim_worker_once.ps1'
$taskName = '\SharkEdge Local Sim Worker'

if (-not (Test-Path $runnerPath)) {
  throw "Runner script not found: $runnerPath"
}

$taskCommand = 'powershell.exe -ExecutionPolicy Bypass -File "' + $runnerPath + '"'

& schtasks.exe /Delete /TN $taskName /F *> $null
& schtasks.exe /Create /TN $taskName /TR $taskCommand /SC MINUTE /MO 15 /F | Out-Null

Write-Host 'Installed scheduled task: SharkEdge Local Sim Worker'
