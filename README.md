# dotai

A cross-platform desktop app that lists, edits, watches, and searches every Claude Code, Claude Desktop, and Copilot CLI configuration file across global and project scopes — in one place.

Built with Tauri 2 (Rust shell ~5–10 MB binary) + React 18 + TypeScript + Vite + Tailwind v4 + CodeMirror 6 + Jotai.

## Features (planned, by milestone)

- **M0** Skeleton — three-pane layout (sidebar / file list / editor), Tailwind v4, CI.
- **M1** Catalog + read-only viewer — sidebar enumerates real files, syntax highlighting.
- **M2** Editing + atomic save — Cmd/Ctrl+S, backup-on-first-edit, line-ending preservation.
- **M3** Schemas + docs links — JSON Schema validation, YAML frontmatter validation, "Docs ↗" buttons.
- **M4** Live watch + conflict resolution — external edits reload, dirty buffers prompt.
- **M5** Search + Projects + Env vars — Cmd/Ctrl+K cross-config search, project picker + auto-scan, env panel.
- **M6** Polish + ship — icon, shortcuts, error toasts, unsigned macOS universal + Windows x64 release.

## Cloud sync (read-only)

dotai can write a snapshot of your tracked configs to any folder you already sync (OneDrive, Dropbox, iCloud, Syncthing, a git repo on a NAS). Other dotai installs pointing at the same folder can browse those snapshots read-only — no apply, no merge.

Excluded by design: env-var values (secrets), `~/.claude.json` (rewrites itself), and `*.local` files (gitignored on purpose).

Configure under **Cloud Sync** in the top bar.

## Out of scope for v1

Diff/compare scopes view, schema-aware form editor, organisation-managed paths, code signing/notarization, auto-update, shell-profile env editing.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+S` | Save the active buffer (atomic write + backup-on-first-edit) |
| `Cmd/Ctrl+K` | Open the cross-config search modal |
| `Esc` | Close any open modal (search, projects, conflict) |

## Development

Requirements: Rust 1.78+, Node 22+, pnpm 10+.

```bash
pnpm install
pnpm tauri dev      # launches the desktop app with HMR
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write (TS/CSS/JSON only)
pnpm format:rust    # cargo fmt
```

## Architecture

The frontend declares every known config file location in a single TypeScript catalog (`src/catalog/`). Path templates use `{home}`, `{copilot_home}`, `{claude_desktop_config}`, `{appdata}`, `{project}` tokens that the Rust `resolve_path` command expands per-OS.

The Rust side stays dumb — it provides commands for path resolution, atomic IO, debounced watching, ripgrep-style search, and env-var enumeration. Catalog edits don't trigger Rust rebuilds.

See `docs/ARCHITECTURE.md`, `docs/CATALOG.md`, `docs/SCHEMAS.md` for more.

## Privacy

No telemetry, ever.

## Platform notes

- **macOS**: Reading `~/Library/Application Support/Claude/` may require Full Disk Access on some macOS versions. The app shows a friendly error if denied.
- **macOS notarization** is skipped for v1 (Apple Developer fee). Use `xattr -d com.apple.quarantine /Applications/dotai.app` after install if Gatekeeper blocks launch.
- **Windows code signing** is skipped for v1. SmartScreen will warn on first launch — click "More info" → "Run anyway".
