# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

dotai is a Tauri 2 desktop app for browsing/editing AI-tool config files (Claude Code, Claude Desktop, Copilot CLI). React 19 + TypeScript + Vite + Tailwind v4 frontend in `src/`; Rust backend in `src-tauri/`.

See `docs/ARCHITECTURE.md`, `docs/CATALOG.md`, `docs/SCHEMAS.md` for the full design rationale.

## Run / verify

Always run from the **project root**, never from `src-tauri/` (pnpm picks up the wrong cwd and `vite` won't be found).

| Command | What it does |
|---|---|
| `pnpm tauri dev` | Launches the desktop app with HMR. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm lint` | ESLint over `src/`. |
| `pnpm format` | Prettier over TS/CSS/JSON only (Rust handled separately). |
| `pnpm format:rust` | `cargo fmt`. |
| `pnpm format:check` | Prettier check (no write). |
| `cargo check` / `cargo clippy --no-deps -- -D warnings` | Rust verification. CI fails on any clippy warning. |

The `/verify` skill runs the full pre-commit pipeline in one go.

## Adding things

**A new config-file location** (most common change): edit one of `src/catalog/{claude-code,claude-desktop,copilot}.ts` and `src/catalog/index.ts`. No Rust rebuild needed — the Rust side is intentionally generic. See `docs/CATALOG.md` for the entry shape and the supported path tokens (`{home}`, `{project}`, `{copilot_home}`, `{claude_desktop_config}`, `{appdata}`).

**A new Tauri command**: register it in **both** places or it won't be callable from JS:
1. `src-tauri/src/commands/mod.rs` — add `pub mod <name>;`
2. `src-tauri/src/lib.rs` — add `<module>::<fn>` to the `invoke_handler![…]` list

Then add a typed wrapper in `src/lib/tauri.ts` that calls `invoke()`. Keep Rust commands as generic primitives (read/write/list/watch); domain knowledge stays in TS.

**A new JSON / frontmatter schema**: add the `.schema.json` to `src/schemas/` (or `src/schemas/frontmatter/`), register it in `src/schemas/index.ts`, then point a catalog entry's `schemaId` (or `frontmatterSchemaId`) at it. `src/lib/editor-extensions.ts` wires it into CodeMirror automatically.

**A new icon design**: edit `src-tauri/icons/source.svg`, then `pnpm tauri icon src-tauri/icons/source.svg` regenerates every platform asset.

## Conventions

- **Tailwind v4 CSS-first** — there is no `tailwind.config.js`. Theme tokens (colours, fonts) live in `src/styles/globals.css` under `@theme`. Use `text-(--color-fg)` / `bg-(--color-bg-subtle)` etc., not arbitrary hex.
- **State is Jotai** (not Redux/Zustand). One atom per concern in `src/state/`; never reach inside another atom — derive.
- **Async-load components** use the discriminated-union pattern (`{ status: "idle" | "loading" | "ready" | "error" }`), not separate boolean flags.
- **CodeMirror mounts** depend on `bufferReady` (boolean) so they don't tear down on every keystroke; the latest buffer reaches the mount effect via a `useRef` synced in a separate effect. See `src/components/Editor/index.tsx`.
- **Atomic save** — `write_file` writes to a sibling tempfile then `persist()`s (rename). First save in a session backs up the original to `appLocalData/backups/<hash>/<timestamp>.bak`. Don't bypass this with raw `fs::write`.
- **Watch contract** — watch parent directories (atomic-write editors rename, not modify), debounce 250 ms, skip recursive watch on `~/.claude/` (history.jsonl etc. churn).
- **Custom Tauri events** — channel names are `dotai://watch`, `dotai://show-about`. Keep the `dotai://` prefix for any new event.

## Code style

- TypeScript: 2-space indent, double quotes, semicolons, trailing commas (Prettier defaults from `.prettierrc.json` apply).
- ESLint: unused-vars allowed when prefixed with `_`. The `react-hooks/set-state-in-effect` rule is **off** (the standard async-fetch loading pattern triggers it spuriously).
- Rust: stable toolchain, MSRV 1.78, `cargo fmt` defaults, **clippy must be clean** (CI runs `-D warnings`).
- Comments: only the WHY when non-obvious. Don't restate what the code does.

## Package manager + tooling

- **pnpm 10+** only. CI uses `pnpm install --frozen-lockfile`. Don't introduce npm or yarn fallbacks.
- **Rust 1.78+**. The toolchain is rustup-managed; `rustup update stable` if `cargo` is out of date.

## Branching / commits

- Solo project on `main` for now — direct commits are fine; no PR workflow yet.
- Commit messages follow conventional-commits style (`feat:`, `fix:`, `chore:`, optionally with a scope like `fix(editor):`). Keep the subject ≤ 72 chars; multi-paragraph body for non-trivial changes.

## Out of scope for v1

Code signing, notarization, auto-updater, diff/compare scopes view, schema-aware form editor, organisation-managed paths, shell-profile env editing. See `README.md` § "Out of scope".
