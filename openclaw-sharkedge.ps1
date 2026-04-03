function Invoke-OpenClaw {
  & "$env:APPDATA\npm\openclaw.cmd" @Args
}

Write-Host ""
Write-Host "SharkEdge OpenClaw helper" -ForegroundColor Cyan
Write-Host "Workspace: C:\Users\krist\OneDrive\Documents\New project\repo" -ForegroundColor DarkGray
Write-Host ""
Write-Host "1. Start gateway" -ForegroundColor Yellow
Write-Host '   Invoke-OpenClaw gateway run --force'
Write-Host ""
Write-Host "2. Check health from another shell" -ForegroundColor Yellow
Write-Host '   Invoke-OpenClaw gateway health'
Write-Host ""
Write-Host "3. Run a local coding turn" -ForegroundColor Yellow
Write-Host '   Invoke-OpenClaw agent --local -m "Help improve SharkEdge home page data integrity and layout polish"'
Write-Host ""
Write-Host "4. List available skills" -ForegroundColor Yellow
Write-Host '   Invoke-OpenClaw skills list'
Write-Host ""
Write-Host "Tip: dot-source this file to keep Invoke-OpenClaw in your session:" -ForegroundColor Green
Write-Host '   . .\openclaw-sharkedge.ps1'
