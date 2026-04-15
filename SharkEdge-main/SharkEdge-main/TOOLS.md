# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## SharkEdge

- Repo root: `C:\Users\krist\OneDrive\Documents\New project\repo`
- Frontend app: `C:\Users\krist\OneDrive\Documents\New project\repo\frontend`
- Production site: `https://sharkedge.vercel.app`
- Main work priorities:
  - keep league data isolated correctly
  - keep home/bets/trends/performance visually consistent
  - improve trend quality with real historical support
  - avoid fake confidence, fake popularity, and wrong-sport bleed

## OpenClaw

- Installed launcher: `C:\Users\krist\AppData\Roaming\npm\openclaw.cmd`
- Workspace bound to this repo via `~\.openclaw\openclaw.json`
- Self-improvement skill path: `C:\Users\krist\.openclaw\skills\self-improving-agent`
- Learnings folder: `C:\Users\krist\.openclaw\workspace\.learnings`
- Gateway on this machine may need to be run manually on Windows if the scheduled-task service does not attach cleanly.
- Best local commands:
  - `& "$env:APPDATA\npm\openclaw.cmd" skills list`
  - `& "$env:APPDATA\npm\openclaw.cmd" gateway run --force`
  - `& "$env:APPDATA\npm\openclaw.cmd" dashboard`
  - `& "$env:APPDATA\npm\openclaw.cmd" agent --local -m "Help improve SharkEdge bets page layout"`
