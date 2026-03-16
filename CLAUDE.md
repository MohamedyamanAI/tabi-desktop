# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Tabi Desktop is a cross-platform Electron desktop app for time tracking with automatic screenshot capture and activity monitoring. It's a client for tabitrack.com, forked from solidtime-desktop. The app tracks time entries, captures screenshots at configurable intervals, monitors idle time, and syncs with the Tabi API.

## Commands

```bash
npm run dev              # Start Electron in dev mode with hot reload
npm run build            # Typecheck + electron-vite build
npm run build:mac        # macOS DMG (requires code signing env vars)
npm run build:win        # Windows NSIS installer
npm run build:linux      # Linux .deb/.rpm/.tar.gz
npm run build:unpack     # Build without packaging (useful for testing)

npm run typecheck        # Run both node + web TypeScript checks
npm run lint             # ESLint with auto-fix
npm run lint:check       # ESLint without auto-fix
npm run format           # Prettier format
npm run format:check     # Prettier check (used in CI)
```

Database migrations are managed with drizzle-kit — run `npx drizzle-kit generate` to create new migrations after schema changes, then they auto-apply on app startup via `src/main/db/migrate.ts`.

## Architecture

This is a standard three-process Electron app:

### Main Process (`src/main/`)
Handles system integration and all privileged operations. Key modules:
- `index.ts` — app lifecycle, window management, IPC channel registration
- `screenshotCapture.ts` — captures screenshots, manages upload queue
- `activityTracker.ts` + `idleMonitor.ts` — tracks active/idle periods
- `windowActivities.ts` + `appIcons.ts` — monitors active window titles and extracts app icons
- `settings.ts` — persists local app settings
- `db/` — Drizzle ORM over SQLite (better-sqlite3), stores `activity_periods`
- `autoUpdater.ts` — electron-updater via GitHub releases

### Preload (`src/preload/`)
The security boundary. Three preload scripts for different windows:
- `main.ts` — full `electronAPI` for the main window
- `mini.ts` — minimal API for the mini timer widget
- `interface.d.ts` — TypeScript definitions for `window.electronAPI`

All renderer↔main communication goes through `contextBridge` in the preload. Never use `ipcRenderer` directly in renderer code.

### Renderer (`src/renderer/src/`)
Vue 3 SPA with Vue Router, Pinia, and TanStack Query:
- `pages/` — 4 top-level pages: Time, Calendar, Statistics, Settings
- `components/` — reusable UI components
- `utils/` — API client wrappers, state helpers, timer logic, theme management
- Uses `@solidtime/ui` design system with Tailwind CSS
- `@solidtime/api` (Zodios-based) for typed API calls to tabitrack.com

### Two Windows
- **Main window** — full app UI (`src/renderer/index.html`)
- **Mini window** — compact timer widget (`src/renderer/mini.html`), separate Vue app entry in `mini.ts`

## Key Technical Details

- **IPC pattern**: Renderer calls `window.electronAPI.method()` → preload forwards via `ipcRenderer.invoke/send` → main process handles via `ipcMain.handle/on`
- **Database**: SQLite via better-sqlite3 + Drizzle ORM. Schema in `src/main/db/schema.ts`, migrations in `drizzle/`
- **Screenshots**: Captured in main process, stored locally, uploaded with time entries. Upload state persisted across restarts.
- **Deep links**: Custom `tabi://` protocol handled by `deeplink.ts`, used for OAuth/auth flows
- **Sentry**: Optional error tracking — only active when `SENTRY_DSN` env var is set at build time
- **macOS permissions**: Screen recording permission required for screenshots — checked/requested via `permissions.ts`
- **Single instance**: App enforces single instance lock; second launch focuses existing window

## Build & Release

Signing env vars needed for production builds:
- `CSC_LINK`, `CSC_KEY_PASSWORD` — macOS code signing certificate
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — notarization
- Release workflow uploads assets to Cloudflare R2 (`CF_R2_*` env vars)

App ID: `io.tabitrack.desktop` | Protocol: `tabi://`
