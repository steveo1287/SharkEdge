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

$bootstrapScript = Join-Path $repoRoot 'scripts\bootstrap_local_oddsharvester.ps1'
$venvPython = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  & powershell.exe -ExecutionPolicy Bypass -File $bootstrapScript
}

$venvPython = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  throw "Virtualenv python not found: $venvPython"
}

$env:PATH = "$(Join-Path $repoRoot '.venv\Scripts');$env:PATH"

& $venvPython -m pip show requests oddsharvester *> $null
if ($LASTEXITCODE -ne 0) {
  & $venvPython -m pip install requests oddsharvester
}

& $venvPython .\scripts\local_oddsharvester_push.py
