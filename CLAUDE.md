# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (Tauri window + Vite HMR)
npx tauri dev

# Build release .app + .dmg
npx tauri build
# Output: src-tauri/target/release/bundle/macos/Reminders Kanban.app

# Sign and install locally
codesign --deep --force --sign - "src-tauri/target/release/bundle/macos/Reminders Kanban.app"
cp -R "src-tauri/target/release/bundle/macos/Reminders Kanban.app" /Applications/
xattr -cr "/Applications/Reminders Kanban.app"

# Compile Swift helper (after changing .swift)
cd src-tauri/swift-helper && swiftc -O -framework EventKit -o reminders-helper reminders-helper.swift

# Swift helper backend tests (56 cases, hits real Reminders)
cd src-tauri/swift-helper && python3 test_helper.py

# Frontend E2E tests (17 cases, Playwright + mock invoke)
npx playwright test
```

## Architecture

```
Frontend (src/main.js)           Vanilla JS, no framework
  ↓ invoke()                     @tauri-apps/api/core
Rust Backend (src-tauri/src/lib.rs)   Tauri v2 commands
  ↓ stdin/stdout JSON-RPC       Persistent child process, Mutex-guarded
Swift Helper (src-tauri/swift-helper/reminders-helper.swift)
  ↓ EventKit                    EKEventStore, EKReminder, EKCalendar
macOS Reminders
```

**Swift helper protocol**: Starts once, sends `{"ready":true}\n`, then loops reading JSON commands from stdin, writing JSON responses to stdout. Commands: `lists`, `list`, `add`, `set-status`, `complete`, `set-priority`, `update`, `delete`, `create-list`, `delete-list`, `rename-list`.

**Rust layer**: `spawn_helper()` starts the Swift binary, `send_cmd()` serializes JSON and reads response. Mutex ensures single-threaded access. Auto-respawns on helper crash.

**Sidecar**: Swift binary is bundled via `externalBin` in `tauri.conf.json`. Dev mode reads from `CARGO_MANIFEST_DIR/swift-helper/`, release from `Contents/MacOS/`.

## Data Model

- One Reminders list = one kanban board
- Three columns: 待办 / 进行中 / 已完成
- **Status** stored in notes prefix: `[kanban:进行中]`
- **Emoji** stored in notes: `[emoji:🔥]`
- **Subtasks** stored in notes as `- [ ] text` / `- [x] text`
- **List emoji** stored as prefix of list name: `🤣 Moe Card`
- Priority maps: 1=high, 5=medium, 9=low, 0=none

`notesWithoutStatus()` and `emojiFromNotes()` in the Swift helper strip these tags before returning `notes` to the frontend. `update` action for `notes` field re-injects existing status and emoji tags.

## Two-Theme System

See `DESIGN.md` for full spec. Key rule:

**All components use CSS variables only.** Glass theme has a global `[data-theme="glass"] * { border-color: transparent !important }` — no per-component Glass overrides needed for borders.

| Variable | shadcn | Glass |
|----------|--------|-------|
| `--border` | `hsl(240 5.9% 90%)` | `transparent` |
| `--card` | `hsl(0 0% 100%)` | `rgba(255,255,255,0.55)` |
| `--radius` | `10px` | `14px` |
| `--font` | Nunito | SF Pro (system-ui) |

Cards and detail panel are always **solid/opaque** in both themes. Only columns, titlebar, and settings use `backdrop-filter` in Glass.

## macOS Permissions

`Info.plist` must contain `NSRemindersFullAccessUsageDescription` — without it, EventKit silently returns NO when launched via `open`/double-click (works fine from CLI). After changing Info.plist, must rebuild + re-codesign.

## Key Gotchas

- **WKWebView has no HTML5 DnD**: Drag-drop is custom `mousedown/mousemove/mouseup`
- **`confirm()`/`alert()`/`prompt()` don't work in Tauri WebView**: Use inline UI instead
- **CSS `zoom` doesn't support `transition`**: Don't animate zoom changes
- **`render()` skips when input has focus**: Prevents IME interruption. Use `render(true)` to force after mutations like `addTask`
- **Emoji picker in constrained space**: Hide sibling sections (detail-body/footer) to make room, restore on close. Don't resize zoom.
