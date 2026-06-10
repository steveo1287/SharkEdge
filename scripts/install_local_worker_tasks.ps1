$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

$tasks = @(
  @{
    Name = '\SharkEdge Local Sim Worker'
    Runner = 'scripts\run_local_sim_worker_once.ps1'
    Schedule = @('/SC', 'MINUTE', '/MO', '15')
  },
  @{
    Name = '\SharkEdge Local MLB Odds Worker'
    Runner = 'scripts\run_local_mlb_odds_worker_once.ps1'
    Schedule = @('/SC', 'MINUTE', '/MO', '15')
  },
  @{
    Name = '\SharkEdge Local UFC Worker'
    Runner = 'scripts\run_local_ufc_worker_once.ps1'
    Schedule = @('/SC', 'MINUTE', '/MO', '60')
  },
  @{
    Name = '\SharkEdge Local Maintenance Worker'
    Runner = 'scripts\run_local_maintenance_worker_once.ps1'
    Schedule = @('/SC', 'DAILY', '/ST', '03:00')
  }
)

foreach ($task in $tasks) {
  $runnerPath = Join-Path $repoRoot $task.Runner
  if (-not (Test-Path $runnerPath)) {
    throw "Runner script not found: $runnerPath"
  }

  $taskCommand = 'powershell.exe -ExecutionPolicy Bypass -File "' + $runnerPath + '"'
  $scheduleArgs = $task.Schedule
  & cmd.exe /c ('schtasks.exe /Delete /TN "' + $task.Name + '" /F >nul 2>&1')
  & schtasks.exe /Create /TN $task.Name /TR $taskCommand @scheduleArgs /F | Out-Null
  Write-Host "Installed scheduled task: $($task.Name)"
}

Write-Host "All local SharkEdge worker tasks installed."
