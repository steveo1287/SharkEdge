# OpenClaw for SharkEdge

Use OpenClaw here as a build helper for SharkEdge, not as the source of betting truth.

## What It Should Help With

- code and UI implementation
- cleanup passes
- trend naming and category refinement
- story drafting assistance
- backlog triage and work breakdown
- repetitive refactors and repo exploration

## What It Should Not Own

- odds truth
- CLV truth
- EV truth
- grading bets
- publishing fake confidence

## Windows Commands

PowerShell on this machine blocks `.ps1` shims, so use the `.cmd` launcher:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" --help
```

## Start the Gateway

If the managed service is flaky on Windows, run it in the foreground:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" gateway run --force
```

In another shell, check health:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" gateway health
```

## Use It on SharkEdge

Run a local turn against this workspace:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" agent --local -m "Audit SharkEdge home page for wrong-sport data bleed and propose a patch"
```

Other useful prompts:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" agent --local -m "Refactor SharkEdge bets page into a sharper best-bets workspace"
& "$env:APPDATA\npm\openclaw.cmd" agent --local -m "Review SharkEdge trends page and remove duplicate low-signal rails"
& "$env:APPDATA\npm\openclaw.cmd" agent --local -m "Find text overflow issues in the frontend and suggest exact fixes"
```

## Skills

List skills:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" skills list
```

Search ClawHub:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" skills search "sports"
```

## Notes

- The repo workspace is already configured in `~\.openclaw\openclaw.json`
- The self-improvement skill is installed and ready
- If local agent auth is not configured yet, run:

```powershell
& "$env:APPDATA\npm\openclaw.cmd" onboard
```

## Discord Control Bridge

You can control OpenClaw from Discord through the SharkEdge bridge script in:

`frontend/scripts/openclaw-discord-bot.ts`

Set these env vars in `frontend/.env.local`:

```env
DISCORD_BOT_TOKEN=
OPENCLAW_DISCORD_ALLOWED_CHANNELS=
OPENCLAW_DISCORD_ALLOWED_USERS=
OPENCLAW_DISCORD_PREFIX=!claw
OPENCLAW_DISCORD_AGENT=main
OPENCLAW_DISCORD_CWD=C:\Users\krist\OneDrive\Documents\New project\repo
```

Then run:

```powershell
cd "C:\Users\krist\OneDrive\Documents\New project\repo\frontend"
npm run openclaw:discord
```

Or use the guided setup helper:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\krist\OneDrive\Documents\New project\repo\frontend\scripts\setup-openclaw-discord.ps1"
```

Discord commands:

```text
!claw help
!claw status
!claw health
!claw skills
!claw run Audit SharkEdge trends and propose exact fixes
!claw stop
```

Important:
- enable the Discord bot `MESSAGE CONTENT INTENT`
- lock the bot to specific channel IDs and user IDs
- this bridge only exposes a narrow OpenClaw command surface, not full shell access
