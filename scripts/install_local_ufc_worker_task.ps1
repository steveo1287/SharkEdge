$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $repoRoot 'scripts\run_local_ufc_worker_once.ps1'
$taskName = '\SharkEdge Local UFC Worker'

if (-not (Test-Path $runnerPath)) {
  throw "Runner script not found: $runnerPath"
}

$taskCommand = 'powershell.exe -ExecutionPolicy Bypass -File "' + $runnerPath + '"'

& schtasks.exe /Delete /TN $taskName /F *> $null
& schtasks.exe /Create /TN $taskName /TR $taskCommand /SC MINUTE /MO 30 /F | Out-Null

Write-Host 'Installed scheduled task: SharkEdge Local UFC Worker'
