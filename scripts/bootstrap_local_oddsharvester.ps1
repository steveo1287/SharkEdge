$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$exampleEnv = Join-Path $repoRoot '.env.local-oddsharvester.example'
$envFile = Join-Path $repoRoot '.env.local-oddsharvester'
$taskInstaller = Join-Path $repoRoot 'scripts\install_local_oddsharvester_task.ps1'
$runOnce = Join-Path $repoRoot 'scripts\run_local_oddsharvester_once.ps1'

if (-not (Test-Path $exampleEnv)) {
  throw "Missing example env file: $exampleEnv"
}

if (-not (Test-Path $envFile)) {
  Copy-Item $exampleEnv $envFile
  Write-Host "Created $envFile from example."
}

$content = Get-Content $envFile -Raw
if ($content -match 'replace_with_your_backend_x_api_key') {
  $apiKey = Read-Host 'Paste your SHARKEDGE_API_KEY'
  if (-not $apiKey) {
    throw 'API key is required.'
  }
  $content = $content -replace 'replace_with_your_backend_x_api_key', [Regex]::Escape($apiKey)
}

$enabledSports = Read-Host 'Enabled sport keys (comma-separated, blank keeps default basketball_nba,baseball_mlb)'
if (-not $enabledSports) {
  $enabledSports = 'basketball_nba,baseball_mlb'
}
if ($content -match '(?m)^ENABLED_SPORT_KEYS=') {
  $content = [Regex]::Replace($content, '(?m)^ENABLED_SPORT_KEYS=.*$', "ENABLED_SPORT_KEYS=$enabledSports")
} else {
  $content = $content.TrimEnd() + "`r`nENABLED_SPORT_KEYS=$enabledSports`r`nBEST_EFFORT_CONTINUE=true`r`n"
}

Set-Content -Path $envFile -Value $content -Encoding UTF8
Write-Host "Updated $envFile"

if (-not (Test-Path '.venv')) {
  python -m venv .venv
}

. .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install requests oddsharvester

$runTest = Read-Host 'Run one test harvest now? (y/n)'
if ($runTest -match '^(y|yes)$') {
  powershell -ExecutionPolicy Bypass -File $runOnce
}

$installTask = Read-Host 'Install the 15-minute scheduled task now? (y/n)'
if ($installTask -match '^(y|yes)$') {
  powershell -ExecutionPolicy Bypass -File $taskInstaller
}

Write-Host ''
Write-Host 'Local OddsHarvester bootstrap complete.'
Write-Host "Env file: $envFile"
Write-Host 'If you skipped the test or task install, you can run those scripts later from /scripts.'
