# 4claw Desktop (Electron)

This is an independent Electron GUI project for managing multiple `4claw` agents.

## Quick Start

1. Place the binary under:
   - `resources/bin/4claw-windows-amd64.exe` (Windows)
2. Install dependencies:
   - `npm.cmd install`
3. Run:
   - `npm.cmd run dev`

## Build

- Windows:
  - `npm.cmd run dist:win`
- macOS:
  - `npm run dist:mac`

## Runtime Data

The app stores managed agents under:

- `<userData>/runtime/agents/<agent-id>/`

Each agent has:

- `config.json`
- `workspace/`
- `logs/runtime.log`
- `meta.json`

Backups are stored under:

- `<userData>/runtime/backups/`

## Features Implemented

- Multi-agent create/delete/rename/start/stop.
- Full log viewer with refresh and clear.
- Agent backup/import/export.
- Recursive full `config.json` editor with save.
