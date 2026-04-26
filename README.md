# dotai

A cross-platform desktop app that lists, edits, watches, and searches every Claude Code, Claude Desktop, and Copilot CLI configuration file across global and project scopes — in one place.

Built with Tauri 2 (Rust shell ~5–10 MB binary) + React 19 + TypeScript + Vite + Tailwind v4 + CodeMirror 6 + Jotai.

## Features

- **Three-pane layout** — sidebar (categories) / file list / CodeMirror editor.
- **Catalog-driven discovery** — every known Claude Code, Claude Desktop, and Copilot CLI config location enumerated from a single TypeScript catalog; per-OS path tokens resolved by Rust.
- **Atomic editing** — Cmd/Ctrl+S writes via temp-file + rename, with a backup of the original on first edit (under `appLocalData/backups/`). Line endings are preserved.
- **Schema validation** — JSON Schema for settings/MCP/keybindings, YAML frontmatter validation for prompt files, with inline lint markers and a "Docs ↗" button per entry.
- **Live watch + conflict resolution** — external edits reload clean buffers automatically; dirty buffers prompt before overwrite.
- **Cross-config search** — Cmd/Ctrl+K opens a ripgrep-backed search across every catalogued file.
- **Projects** — pick any directory, auto-scan for project-scope `.claude/`, `.github/copilot/`, etc.
- **Env vars panel** — enumerate every `ANTHROPIC_*` / `CLAUDE_*` / `COPILOT_*` value the current shell exposes.
- **Inline reference navigation** — `@`-prefixed paths and absolute paths in markdown previews are clickable; jump straight to the referenced file in the editor.

## Cloud sync (read-only)

dotai can write a snapshot of your tracked configs to any folder you already sync (OneDrive, Dropbox, iCloud, Syncthing, a git repo on a NAS). Other dotai installs pointing at the same folder can browse those snapshots read-only — no apply, no merge.

Excluded by design: env-var values (secrets), `~/.claude.json` (rewrites itself), and `*.local` files (gitignored on purpose).

Configure under **Cloud Sync** in the top bar.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+S` | Save the active buffer (atomic write + backup-on-first-edit) |
| `Cmd/Ctrl+K` | Open the cross-config search modal |
| `Esc` | Close any open modal (search, projects, conflict) |

## Building from source

Requirements: Rust 1.78+, Node 22+, pnpm 10+.

```bash
pnpm install
pnpm tauri dev      # launches the desktop app with HMR
pnpm tauri build    # produces a release bundle in src-tauri/target/release/bundle/
```

Contributor docs (architecture, catalog format, schemas) live under `docs/`.

## Privacy

No telemetry, ever.

## Platform notes

- **macOS**: Reading `~/Library/Application Support/Claude/` may require Full Disk Access on some macOS versions. The app shows a friendly error if denied.
- **macOS notarization** is skipped for v1 (Apple Developer fee). Use `xattr -d com.apple.quarantine /Applications/dotai.app` after install if Gatekeeper blocks launch.
- **Windows code signing** is skipped for v1. SmartScreen will warn on first launch — click "More info" → "Run anyway".
