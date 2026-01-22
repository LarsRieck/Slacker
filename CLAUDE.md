# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

```bash
npm install        # Install dependencies
npm start          # Start the Electron application
npm run build:win  # Build Windows NSIS installer (output: dist/)
```

No test framework or linting tools are currently configured.

## Architecture Overview

Slacker is a recurring task checklist desktop application built with Electron. It uses a two-window architecture:

1. **Main Window** (`src/index.html`) - Daily task view with date navigation, sorting, and autocomplete
2. **Manage Window** (`src/manage.html`) - Full task list management

### Process Architecture

```
Main Process (main.js)
├── Window management (creates Main and Manage windows)
├── IPC handlers (get-tasks, get-all-tasks, add-task, toggle-task, delete-task)
├── Notification system (checks every 60 seconds for reset time alerts)
└── Database operations via database.js

Preload (preload.js)
└── Context bridge exposing window.api to renderers

Renderer Processes
├── src/renderer.js - Main window logic (sorting, autocomplete, custom modals)
└── src/manage.js - Manage window logic
```

### Database Layer (database.js)

Uses sql.js (in-memory SQLite) with file persistence to `%APPDATA%\slacker\slacker.db`.

**Two tables:**
- `tasks`: Recurring task definitions (id, title, task_time, recurrence_type, recurrence_value, reset_time, created_at)
- `completions`: Per-date completion tracking (task_id, completed_date)

**Recurrence types:**
- `daily` - Every day
- `weekly` - Specific days (0=Sun through 6=Sat, comma-separated)
- `monthly` - Specific day of month (1-31)

**Key functions:**
- `getEffectiveDateForTask(resetTime)` - Calculates which date a task belongs to based on reset time
- `getTasksForDate(dateStr)` - Gets tasks for a date with completion status
- `getTasksWithResetTimesForToday()` - Gets tasks with reset times for notification checking

### Custom Reset Time Logic

Tasks can have a custom `reset_time` (HH:MM format). The "effective date" determines which day a task belongs to:
- If current time is before reset_time → task is still in yesterday's period
- If current time is at/after reset_time → task is in today's period

This affects both display (completion status) and toggle operations.

### Key Data Flow

1. Renderer calls `window.api.method()` (defined in preload.js)
2. Preload invokes IPC to main process
3. Main process handler calls database.js functions
4. Results return through IPC to renderer

### Notification System

Runs every 60 seconds, checking for:
- Tasks resetting in 1 hour (warning notification)
- Tasks resetting now (reset notification)
- Notifications are pooled by time slot to avoid spam

### UI Features

- **Sorting**: Three modes (Status & Time, Alphabetical, Reset Time), saved to localStorage
- **Autocomplete**: Suggests existing task titles, keyboard navigable
- **Custom modals**: Replace native confirm/alert to avoid Windows focus issues
- **Auto-refresh**: Task list refreshes every 10 seconds to catch reset transitions

### Security Model

- Context isolation enabled, nodeIntegration disabled
- Renderer code sandboxed with no direct Node access
- HTML escaping via `escapeHtml()` in renderers prevents XSS
