# Architecture

dotai is a Tauri 2 desktop app: a thin Rust shell + a React frontend. The frontend owns the UI and the catalog (single source of truth for known config locations); the Rust side provides safe IO, watching, search, and env enumeration.

## Layers

```
┌─ React frontend (src/) ────────────────────┐
│  Catalog ─ Components ─ State (Jotai) ─ Lib │
│           │                                  │
│           └─ Editor: CodeMirror 6 + schemas  │
└────────────────────────────────────────────┘
                  │
                  │ tauri::invoke
                  ▼
┌─ Rust backend (src-tauri/) ────────────────┐
│  paths   files   watch   search   env  scan │
│  └ template expansion + cross-platform IO  │
└────────────────────────────────────────────┘
```

## Why this split

- **Catalog stays in TS.** Adding a new config file means editing one TypeScript array, not rebuilding the binary.
- **Schemas stay in TS.** Same reason. Validation runs in-renderer so it's cheap and incremental.
- **Rust stays dumb.** Generic primitives only: read/write/list/stat/watch/search/env. No domain knowledge bleeds into the binary.

## Critical files

| File | Role |
|------|------|
| `src/catalog/index.ts` | Single source of truth for every known config location |
| `src-tauri/src/commands/paths.rs` | Template-token resolution per OS |
| `src-tauri/src/commands/files.rs` | Atomic read/write via `tempfile::persist`, backup-on-first-edit |
| `src-tauri/src/commands/watch.rs` | Debounced parent-dir watch via `notify-debouncer-full` |
| `src-tauri/src/commands/search.rs` | Cross-config grep via `grep-searcher` |
| `src-tauri/src/commands/env.rs` | Env-var enumeration with secret masking |
| `src-tauri/src/commands/scan.rs` | Project auto-scan (looks for `.claude/`, `.mcp.json`, etc.) |
| `src/components/Editor/index.tsx` | CodeMirror wrapper, schema integration, dirty tracking, keymap |

## Conflict-resolution flow

1. When a file opens, the renderer asks the Rust watcher to start watching the file's parent dir.
2. The Rust watcher emits a debounced `dotai://watch` event when anything in that dir changes.
3. The renderer reloads the file from disk:
   - Same content → silently update mtime.
   - Different + buffer clean → silently swap.
   - Different + buffer dirty (or `~/.claude.json` always-prompt) → open the conflict dialog.

## Save flow

1. `Cmd/Ctrl+S` → renderer calls `write_file` with `{path, content, line_ending, mode, backup_dir}`.
2. Rust writes to a tempfile in the same dir, calls `persist()` (rename) — atomic.
3. First save in a session also copies the original to `appLocalData/backups/<hash>/<timestamp>.bak`.
4. On Unix, the original mode is preserved.

## Privacy

No telemetry. The Rust binary makes no network calls; the only network calls in the renderer are the user-initiated "Docs ↗" buttons (handled by `tauri-plugin-opener` opening the system browser).
