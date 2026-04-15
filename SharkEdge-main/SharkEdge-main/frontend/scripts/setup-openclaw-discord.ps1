$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"

function Read-Required([string]$label) {
  do {
    $value = Read-Host $label
  } while ([string]::IsNullOrWhiteSpace($value))
  return $value.Trim()
}

function Set-Or-AppendEnv([string]$path, [string]$key, [string]$value) {
  $line = "$key=$value"

  if (-not (Test-Path $path)) {
    Set-Content -Path $path -Value $line
    return
  }

  $content = Get-Content -Path $path
  $updated = $false
  $next = foreach ($existing in $content) {
    if ($existing -match "^${key}=") {
      $updated = $true
      $line
    } else {
      $existing
    }
  }

  if (-not $updated) {
    $next += $line
  }

  Set-Content -Path $path -Value $next
}

Write-Host ""
Write-Host "OpenClaw Discord bridge setup for SharkEdge" -ForegroundColor Cyan
Write-Host ""
Write-Host "You need these from Discord Developer Portal + Discord itself:" -ForegroundColor DarkGray
Write-Host "- Bot token" -ForegroundColor DarkGray
Write-Host "- Allowed channel ID" -ForegroundColor DarkGray
Write-Host "- Your Discord user ID" -ForegroundColor DarkGray
Write-Host ""

$token = Read-Required "Discord bot token"
$channelId = Read-Required "Allowed Discord channel ID"
$userId = Read-Required "Your Discord user ID"
$prefix = Read-Host "Command prefix (default !claw)"
if ([string]::IsNullOrWhiteSpace($prefix)) {
  $prefix = "!claw"
}

Set-Or-AppendEnv $envFile "DISCORD_BOT_TOKEN" $token
Set-Or-AppendEnv $envFile "OPENCLAW_DISCORD_ALLOWED_CHANNELS" $channelId
Set-Or-AppendEnv $envFile "OPENCLAW_DISCORD_ALLOWED_USERS" $userId
Set-Or-AppendEnv $envFile "OPENCLAW_DISCORD_PREFIX" $prefix
Set-Or-AppendEnv $envFile "OPENCLAW_DISCORD_AGENT" "main"
Set-Or-AppendEnv $envFile "OPENCLAW_DISCORD_CWD" "C:\Users\krist\OneDrive\Documents\New project\repo"

Write-Host ""
Write-Host "Saved Discord bridge settings to $envFile" -ForegroundColor Green
Write-Host "Starting bot..." -ForegroundColor Cyan
Write-Host ""

Push-Location $root
try {
  npm.cmd run openclaw:discord
}
finally {
  Pop-Location
}
