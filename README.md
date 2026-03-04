<div align="center">
  <a href="./README.md"><kbd>English (Default)</kbd></a>
  <a href="./README.zh-CN.md"><kbd>简体中文</kbd></a>
  <a href="./README.ru.md"><kbd>Русский</kbd></a>
</div>

<br />

<div align="center">
  <img src="../resource/logo.png" alt="4claw logo" width="128" />
</div>

<div align="center">
  <img src="../resource/banner.png" alt="4claw desktop banner" width="100%" />
</div>

# 4claw CLI Desktop

4claw CLI Desktop is an Electron-based GUI that turns the `4claw` single-binary gateway runtime into a visual, multi-agent desktop control center.

It is designed for users who want the power of CLI agents with easier day-to-day operations: creation, startup control, config editing, logs, backup management, and tray/background lifecycle.

## What This Project Delivers

### 1. Multi-agent lifecycle management

- Create, rename, delete, start, and stop multiple agents.
- Each agent has isolated runtime data:
  - `config.json`
  - `workspace/`
  - `logs/runtime.log`
  - `meta.json`

### 2. Guided agent creation wizard

- Step 1: agent name + model setup (`model alias`, `model name`, `api_base`, `api_key`)
- Step 2: Telegram setup (`enabled`, `bot token`, `allow_from`)
- One-click `Create & Start`:
  - creates agent folder and metadata
  - writes mapped values to `config.json`
  - starts the gateway process automatically

### 3. Dual config editing modes

- `Quick Config`: focused form for common operational fields
- `Full Config`: recursive JSON editor for complete `config.json`
- Import/export config supported from UI

### 4. Log and backup operations

- Real-time log refresh (0.5s polling while in Logs tab)
- Clear logs from UI
- Create/export/import/restore backups
- Restore backup into a new agent instance

### 5. Desktop UX for long-running agents

- Frameless desktop window with custom top-right controls
- Minimize/close controls in header
- Tray mode support:
  - close behavior: ask every time / minimize to tray / exit directly
  - tray menu with panel reopen and full exit

### 6. Visual system

- Bright neumorphic + glassmorphism UI
- Yellow/orange palette inspired by BSC-like visual language
- Consistent icon/logo replacement across app shell and tray identity

## Screenshots

### Main Console

![Main Console](../resource/cli/main.png)

### Settings and Configuration

![Settings Panel](../resource/cli/setting.png)

## Tech Stack

- Electron (main/preload/renderer architecture)
- Plain HTML/CSS/Vanilla JavaScript renderer
- Node.js filesystem/process integration in main process
- IPC bridge via `contextBridge` + `ipcRenderer.invoke`
- Packaging:
  - `electron-builder` for Windows and macOS
  - NSIS installer + Windows portable executable + macOS DMG

## Architecture Overview

### Main process (`src/main`)

- Window lifecycle and close behavior policies
- Tray lifecycle and tray menu actions
- Agent process spawn/stop logic
- Filesystem operations for config/log/backup
- IPC handlers for renderer requests

### Preload (`src/preload`)

- Secure API surface exposed to renderer:
  - app init and settings
  - agent CRUD and process controls
  - config/log/backup actions
  - folder opening and window controls

### Renderer (`src/renderer`)

- Tabbed desktop UI:
  - Dashboard
  - Config (Quick / Full)
  - Logs
  - Backups
  - Settings
- Creation wizard and JSON editor rendering logic
- Real-time log polling and state synchronization

## Binary Placement

Put compiled `4claw` binaries into:

- `resources/bin/4claw-windows-amd64.exe` (Windows x64)
- `resources/bin/4claw-darwin-amd64` (macOS Intel)
- `resources/bin/4claw-darwin-arm64` (macOS Apple Silicon)

The desktop app resolves binaries from multiple runtime candidates, with `resources/bin` as the primary expected location.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Place the correct 4claw binary in `resources/bin/`.

3. Start development mode:

```bash
npm run dev
```

## Build Commands

- Unpacked local bundle (for quick local test):

```bash
npm run pack
```

- Windows installer only (NSIS):

```bash
npm run dist:win
```

- Windows portable single executable:

```bash
npm run dist:win:portable
```

- Windows installer + portable in one run:

```bash
npm run dist:win:all
```

- macOS DMG:

```bash
npm run dist:mac
```

## Runtime Data and Backup Model

Desktop runtime root:

- `<userData>/runtime/`

Agent folders:

- `<userData>/runtime/agents/<agent-id>/`

Backup archive folders:

- `<userData>/runtime/backups/`

This structure makes migration and disaster recovery straightforward. You can export backups per agent and import them into another machine or profile.

## Why It Is Convenient

- Removes repetitive CLI operations for daily management
- Reduces config mistakes via guided forms
- Preserves full flexibility through full JSON editing
- Improves observability with near real-time logs
- Makes operations safer with backup import/export/restore workflow
- Keeps agents available in background using tray mode

## License

MIT
