# Cloud Sync — Read-Only Remote View

**Status:** Design approved, awaiting implementation plan
**Date:** 2026-04-25
**Scope:** v1 — local-folder provider; pluggable abstraction for future providers

## Goal

Let a dotai user view their AI-tool configs (settings, memory, agents, commands, skills, etc.) from one machine while sitting at another. Strictly read-only across machines: no apply, no merge, no overwrite. The transport is whatever cloud-sync mechanism the user already trusts (OneDrive, Dropbox, iCloud, Syncthing, a git repo on a NAS, etc.) — dotai writes to and reads from a folder on disk and lets the user's existing sync app move the bytes.

## Non-Goals (v1)

- Bidirectional sync, conflict resolution, "apply remote to local"
- Bundled cloud back-end (no servers, no accounts dotai owns)
- Encryption-at-rest of the snapshot itself (the user's chosen sync app/storage handles confidentiality)
- Syncing secrets (env vars, OAuth tokens) — actively excluded
- Syncing volatile state (`.claude.json`)
- Project-local files (gitignored on purpose)
- Background pushes or pulls — every transfer is user-initiated
- Non-filesystem providers (GitHub, Azure Blob, FTP) — interface designed for them but no impl ships in v1

## User Experience

1. User opens **Settings → Cloud Sync**, picks "Local folder", selects a folder, names this machine (`Work laptop`), clicks **Push snapshot now**.
2. Sometime later, on machine B (also configured to point at the same folder), the user opens the **Other machines** section in the left rail. They see `Work laptop` listed with a "pushed 12 minutes ago" timestamp.
3. Clicking `Work laptop` reveals a familiar tree of catalog entries. Clicking a file opens it in the existing editor in read-only mode with a banner: *"Read-only — from Work laptop, pushed 12 min ago"*.
4. Nothing on machine B's local filesystem changes.

## Architecture

Mirrors the project's existing layering: TypeScript owns domain knowledge, Rust stays a generic IO primitive provider. **No new Tauri commands or Rust code.**

```
src/sync/
  types.ts             ← SyncProvider interface, SnapshotManifest type, slug helpers
  manifest.ts          ← build/parse manifest.json; sha256 helpers
  exclusions.ts        ← which catalog entries to skip
  snapshot.ts          ← collect local files into a snapshot; render remote into a tree
  providers/
    types.ts           ← shared helpers
    filesystem.ts      ← v1 provider (uses existing Rust commands)
    index.ts           ← provider registry
  index.ts             ← public API: pushSnapshot, listMachines, listFilesForMachine, readRemoteFile

src/state/
  sync.ts              ← Jotai atoms (config, remote machines, selection)

src/components/Sync/
  SyncSettings.tsx     ← settings drawer panel
  OtherMachines.tsx    ← left-rail entry, lists remote machines
  RemoteFileView.tsx   ← read-only editor host
```

Sync settings persist via `tauri-plugin-store` in a new `sync.json` (same pattern as `projects-store.ts`).

### Why no Rust changes

The filesystem provider only needs `list_dir`, `read_file`, `write_file` and `stat_path` — already registered. Future cloud providers (GitHub Contents API, Azure Blob, FTP) make their HTTP calls from the renderer via the Tauri HTTP plugin, preserving the project's *"the Rust binary makes no network calls"* commitment in `docs/ARCHITECTURE.md`.

## Provider Abstraction

```ts
// src/sync/types.ts
export type RemotePath = string; // POSIX, e.g. "dotai/work-laptop/manifest.json"

export type RemoteEntry = {
  path: RemotePath;
  sizeBytes: number;
  mtimeMs?: number;
};

export interface SyncProvider {
  readonly id: string;     // "filesystem" | future: "github" | "azure" | "ftp"
  readonly label: string;  // human-readable for UI

  /** Recursive listing of files under `prefix`. Files only — directories implied by paths. */
  list(prefix: RemotePath): Promise<RemoteEntry[]>;
  readText(path: RemotePath): Promise<string>;
  writeText(path: RemotePath, content: string): Promise<void>;
}

export type ProviderConfig =
  | { kind: "filesystem"; rootPath: string };
// future variants: github, azure, ftp, …
```

**No `delete()` in v1.** Manual push only writes/overwrites; a stale machine folder is harmless and the user can remove it themselves through their sync app. Adding `delete` later is a one-method extension.

**Filesystem provider** is ~50 lines wrapping the existing Tauri commands:

- `list(prefix)` → `listDir(join(rootPath, prefix))`, recursing as needed
- `readText(p)` → `readFile(join(rootPath, p)).then(r => r.content)`
- `writeText(p, c)` → `writeFile({ path: join(rootPath, p), content: c })` — gets the existing atomic-write + per-session backup machinery for free

**Provider registry**: a `Map<kind, factory>` populated at module load. Adding a future provider = new file under `src/sync/providers/` + one line in `index.ts`.

## Snapshot Format

### On-disk layout

```
<sync-root>/
└── dotai/
    └── <machine-slug>/
        ├── manifest.json
        └── files/
            ├── cc.user.settings/settings.json
            ├── cc.user.memory/CLAUDE.md
            ├── cc.user.agents/code-reviewer.md
            ├── cc.user.commands/deploy.md
            ├── cc.user.skills/<skill-dir>/SKILL.md
            ├── cc.project.settings/<project-slug>/settings.json
            └── cc.project.memory.root/<project-slug>/CLAUDE.md
```

- One folder per catalog entry id beneath `files/`.
- `kind: "file"` → exactly one file under the entry-id folder.
- `kind: "dir-of-files"` → original filenames preserved (skills retain their containing directory because the catalog glob is `*/SKILL.md`).
- Project-scoped entries get an extra `<project-slug>` segment so multiple projects don't collide.

### `manifest.json`

```jsonc
{
  "schemaVersion": 1,
  "machineId": "work-laptop",          // slug used in folder name
  "machineLabel": "Work laptop",       // display name
  "hostname": "Pauls-MacBook-Pro.local",
  "platform": "darwin",                // "darwin" | "linux" | "win32"
  "pushedAtMs": 1714032000000,
  "dotaiVersion": "0.1.0",
  "files": [
    {
      "entryId": "cc.user.settings",
      "scope": "user",
      "relativePath": "settings.json",
      "sizeBytes": 1234,
      "sha256": "…",
      "sourceMtimeMs": 1714000000000
    },
    {
      "entryId": "cc.project.memory.root",
      "scope": "project",
      "projectSlug": "aifiles",
      "projectAbsPath": "/Users/paul.mcilreavy/src/aifiles",
      "relativePath": "CLAUDE.md",
      "sizeBytes": 4853,
      "sha256": "…",
      "sourceMtimeMs": 1714010000000
    }
  ]
}
```

The viewer reads `manifest.json` first to render the tree (single round trip vs walking `files/`, which matters once cloud providers bill per LIST). Files are lazy-loaded via `provider.readText()` only on click.

### Slug rule

Machine label and project slug both pass through one slugifier: lowercase, ASCII alphanumerics + hyphens, max 64 chars, deduped against existing machine folders by appending `-2`, `-3`, … on first push only. Original label always stored verbatim in the manifest.

## What Gets Synced

`src/sync/exclusions.ts` defines hard-coded skip rules:

```ts
export const SYNC_EXCLUDED_ENTRY_IDS = new Set([
  "cc.user.statefile",          // ~/.claude.json — Claude Code rewrites this constantly
]);
export const SYNC_EXCLUDED_KINDS: EntryKind[] = ["env"];        // env-var category — secrets
export const SYNC_EXCLUDED_SCOPES: Scope[] = ["project-local"]; // gitignored by design
```

For `dir-of-files` entries, the entry's `fileGlob` filters which children get included.

Project-scoped entries push **only for projects already in the local `projects.json`** — dotai cannot resolve `{project}` for unknown projects.

## Push Flow

1. User clicks **Push snapshot now**.
2. Iterate the catalog, applying exclusions; for each remaining entry, resolve the absolute path(s) and read the file(s) via `read_file`.
3. Build the in-memory snapshot: list of `{ remotePath, content, manifestEntry }`.
4. For each file: `provider.writeText(remotePath, content)`. Sequential — no parallelism in v1. Show a progress toast (`Pushed 7 / 23`).
5. **Last:** `provider.writeText("dotai/<slug>/manifest.json", manifestJson)`. Manifest-last is the recovery invariant: a missing manifest = aborted push.
6. On success, store `lastPushedAtMs` in `sync.json` and refresh the displayed last-push timestamp in the **Cloud Sync** panel.

## Pull / View Flow

1. User opens **Other machines**.
2. Atom transitions to `loading`; `provider.list("dotai/")` returns a recursive flat list; the snapshot module filters for paths matching `dotai/*/manifest.json` (exactly one path segment between `dotai/` and `/manifest.json`) and reads each via `provider.readText()`.
3. Atom transitions to `ready` with a list of `{ machineId, label, hostname, pushedAtMs, files }`.
4. User clicks a machine → renders the tree from `manifest.files` (no extra fetch).
5. User clicks a file → atom triggers `provider.readText(remotePath)`, opens the result in the existing editor with `EditorState.readOnly` set true and a banner.

Pull is on-demand, never on app start. A "Refresh" button re-runs step 2.

## Errors & Edge Cases

| Case | Behaviour |
|------|-----------|
| Sync folder missing/moved | Red banner in **Cloud Sync** panel and **Other machines** view; prompt to reconfigure. |
| Partial push (process killed mid-write) | Manifest-last invariant: missing manifest → viewer skips folder silently. Manifest pointing at a missing file → per-file warning, others viewable. |
| Two machines, same label | Slugifier appends `-2`, `-3`, … on **first** push only (detected by listing existing machine folders). Stable thereafter. |
| Catalog entry-id drift between dotai versions | Unknown `entryId` rendered as `(unknown entry)` in the tree but file is still viewable. |
| Remote project not present locally | Grouped under "Projects on `<machine>`" — independent of local `projects.json`. |
| Large `dir-of-files` (skills with many files) | Sequential writes with `Pushed N / M` toast. Push button disabled while in flight. |
| Read of a file whose `sha256` no longer matches | Show a warning banner in the read-only editor: *"Content changed since manifest was written."* Still display the file. |
| Provider write failure mid-push | Push aborts on first error; show error toast with the failing path. Manifest is **not** written, so the viewer treats the prior manifest (if any) as the latest valid snapshot. |

## Persistence

`sync.json` (`tauri-plugin-store`) holds:

```jsonc
{
  "providerConfig": { "kind": "filesystem", "rootPath": "/Users/.../OneDrive" },
  "machineLabel": "Work laptop",
  "machineSlug": "work-laptop",
  "lastPushedAtMs": 1714032000000
}
```

No secrets in v1 (filesystem provider has none). When cloud providers are added, token storage will use `tauri-plugin-store` with the OS keychain bridge and a `tokenRef` indirection in `ProviderConfig` rather than embedding the token.

## Testing

- **Unit tests**: `slugify`, `manifest.ts` (build → parse round-trip, sha256 verification), `exclusions.ts` (filter against the real catalog), `snapshot.ts` (collect local snapshot from a fixture catalog).
- **`InMemoryProvider`** (`Map<string, string>`-backed) for fast tests of push/pull orchestration.
- **Filesystem provider integration test**: write to a tmpdir, verify on-disk layout matches the generated manifest, read back and assert content equality.
- **UI**: manual testing per `CLAUDE.md` convention — no automated UI tests in v1.

## Out of Scope (deferred)

- Cloud providers (GitHub, Azure, FTP, S3) — interface designed to fit them; impls land separately.
- "Apply remote file to local" with confirmation + backup — straightforward extension once read-only is solid.
- Bidirectional sync with conflict resolution — explicitly rejected for v1; would re-open everything we just decided to skip.
- Encryption-at-rest of the snapshot — relies on the user's chosen sync transport for now.
- Background push or scheduled push — manual-only is the chosen UX for v1.
- Snapshot retention / history — every push overwrites; the user's sync provider can keep history if they want it (git repo, OneDrive version history, etc.).
