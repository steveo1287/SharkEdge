$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Test-PythonCandidate {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Exe,
    [string[]]$Args = @()
  )

  try {
    & $Exe @($Args + @('--version')) *> $null
    return $true
  } catch {
    return $false
  }
}

function Get-PythonLauncher {
  $candidates = @()

  if (Get-Command py.exe -ErrorAction SilentlyContinue) {
    $candidates += [pscustomobject]@{ Exe = 'py.exe'; Args = @('-3.12') }
    $candidates += [pscustomobject]@{ Exe = 'py.exe'; Args = @('-3') }
  }

  $commonPaths = @(
    (Join-Path $env:LocalAppData 'Programs\Python\Python312\python.exe'),
    (Join-Path $env:LocalAppData 'Programs\Python\Python311\python.exe'),
    'C:\Program Files\Python312\python.exe',
    'C:\Program Files\Python311\python.exe'
  )

  $registryPaths = Get-ItemProperty 'HKCU:\Software\Python\PythonCore\*\InstallPath' -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath } |
    Select-Object -ExpandProperty ExecutablePath

  foreach ($path in $commonPaths) {
    if (Test-Path $path) {
      $candidates += [pscustomobject]@{ Exe = $path; Args = @() }
    }
  }

  foreach ($path in $registryPaths) {
    if (Test-Path $path) {
      $candidates += [pscustomobject]@{ Exe = $path; Args = @() }
    }
  }

  foreach ($candidate in $candidates) {
    if (Test-PythonCandidate -Exe $candidate.Exe -Args $candidate.Args) {
      return $candidate
    }
  }

  return $null
}

function Ensure-PythonLauncher {
  $launcher = Get-PythonLauncher
  if ($launcher) {
    return $launcher
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'Python is not installed and winget is unavailable.'
  }

  Write-Host 'Installing Python 3.12 with winget...'
  winget install --id Python.Python.3.12 --source winget --exact --silent --accept-package-agreements --accept-source-agreements

  $launcher = Get-PythonLauncher
  if (-not $launcher) {
    throw 'Python installation completed, but no usable python launcher was found.'
  }

  return $launcher
}

$launcher = Ensure-PythonLauncher

if (-not (Test-Path '.venv')) {
  Write-Host 'Creating .venv...'
  & $launcher.Exe @($launcher.Args + @('-m', 'venv', '.venv'))
}

$venvPython = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  throw "Virtualenv python not found: $venvPython"
}

if (-not (Test-Path '.env.local-oddsharvester') -and (Test-Path '.env.local-oddsharvester.example')) {
  Copy-Item '.env.local-oddsharvester.example' '.env.local-oddsharvester'
  Write-Host 'Created .env.local-oddsharvester from example. Fill in SHARKEDGE_API_KEY before posting.'
}

Write-Host 'Installing local worker dependencies...'
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install requests oddsharvester
$env:PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT = '180000'
& $venvPython -m playwright install chromium
if ($LASTEXITCODE -ne 0) {
  throw 'Playwright browser install failed.'
}

Write-Host "Bootstrap complete. Python=$venvPython"
