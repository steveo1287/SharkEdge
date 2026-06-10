$ErrorActionPreference = 'Stop'

$tasks = @(
  '\SharkEdge Local Sim Worker',
  '\SharkEdge Local MLB Odds Worker',
  '\SharkEdge Local UFC Worker',
  '\SharkEdge Local Maintenance Worker'
)

foreach ($task in $tasks) {
  & schtasks.exe /Delete /TN $task /F *> $null
  Write-Host "Removed scheduled task: $task"
}
