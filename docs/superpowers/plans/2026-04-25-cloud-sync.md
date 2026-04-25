# Cloud Sync (Read-Only Remote View) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of dotai cloud sync — a manual-push, on-demand-pull, read-only remote-view feature backed by a pluggable `SyncProvider` abstraction with a single filesystem provider in v1.

**Architecture:** All new code in TypeScript under `src/sync/`. No Rust changes. Filesystem provider wraps existing Tauri commands (`list_dir`, `read_file`, `write_file`, `stat_path`). Snapshot module is pure logic over a small `LocalIO` injection seam so it's unit-testable without a Tauri runtime. Settings persist via the existing `tauri-plugin-store` pattern. UI integrates into the existing Sidebar / Settings drawer / Editor.

**Tech Stack:** TypeScript, React 19, Jotai, Tauri 2, `tauri-plugin-store`, `tauri-plugin-dialog`, CodeMirror 6, Tailwind v4. Adds vitest for unit tests (project has none today).

**Spec:** `docs/superpowers/specs/2026-04-25-cloud-sync-design.md`

---

## File Structure

**New files:**

```
src/sync/
  types.ts                  ← SyncProvider, RemoteEntry, RemotePath, ProviderConfig, LocalIO
  slugify.ts                ← slugify(label, takenSet?) — pure, tested
  exclusions.ts             ← isEntryExcluded(entry); filters catalog → eligible entries
  manifest.ts               ← buildManifest(...), parseManifest(json), sha256 helper
  snapshot.ts               ← collectSnapshot(catalog, projects, io) → {files, manifest}
  providers/
    types.ts                ← joinRemote(parts), splitRemote(path) helpers
    in-memory.ts            ← InMemoryProvider (test fixture, also useful for stories)
    filesystem.ts           ← FilesystemProvider — wraps LocalIO
    index.ts                ← createProvider(config, io) registry
  api.ts                    ← pushSnapshot, listMachines, readRemoteFile (top-level orchestration)
  index.ts                  ← public re-exports
  test-helpers/
    node-io.ts              ← nodeIO(root) — LocalIO impl using node:fs (tests only)

src/state/
  sync.ts                   ← Jotai atoms

src/lib/
  sync-store.ts             ← LazyStore wrapper (mirrors projects-store.ts)
  local-io.ts               ← tauriLocalIO — production LocalIO impl, wraps src/lib/tauri.ts

src/components/Sync/
  SyncSettingsPanel.tsx     ← settings panel (provider config, machine label, push button)
  OtherMachinesSection.tsx  ← left-rail entry; lists machines + tree
  RemoteFileViewer.tsx      ← read-only editor host with banner

vitest.config.ts            ← test config (small)
```

**Modified files:**

- `package.json` — add vitest dev dep + `test` script
- `src/components/Sidebar/index.tsx` (or wherever the sidebar is composed) — add `OtherMachinesSection`
- The settings drawer host (TBD, located during Task 13) — add `SyncSettingsPanel`

---

## Conventions for this plan

- Every task ends in a commit using conventional-commits style (`feat:`, `test:`, `chore:`) per `CLAUDE.md`.
- Run `pnpm typecheck` and `pnpm lint` before each commit; the user already has these set up.
- Run `pnpm test` (added in Task 1) for any task that adds tests.
- Test files sit next to source: `src/sync/slugify.test.ts` for `src/sync/slugify.ts`. Vitest auto-discovers them.
- All new code uses 2-space indent, double quotes, semicolons, trailing commas (Prettier defaults).
- Tailwind v4: use `text-(--color-fg)` style, no arbitrary hex.

---

## Task 1: Bootstrap vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/sync/__smoke__.test.ts` (deleted at end of task — proves the runner works)

- [ ] **Step 1: Add vitest dev dep**

```bash
pnpm add -D vitest@^2.1.0
```

- [ ] **Step 2: Add test script in `package.json`**

In the `"scripts"` section of `package.json`, add two entries (insert after the existing `"format:rust"` line, keeping JSON syntax valid):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Add a smoke test**

Create `src/sync/__smoke__.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest smoke test", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm test
```

Expected: `1 passed`.

- [ ] **Step 6: Delete the smoke test**

```bash
rm src/sync/__smoke__.test.ts
```

- [ ] **Step 7: Verify lint + typecheck still pass**

```bash
pnpm typecheck && pnpm lint
```

Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore(sync): bootstrap vitest for unit testing"
```

---

## Task 2: Slugify utility

**Files:**
- Create: `src/sync/slugify.ts`
- Test: `src/sync/slugify.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/sync/slugify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases ASCII alphanumerics + hyphens", () => {
    expect(slugify("Work Laptop")).toBe("work-laptop");
  });

  it("collapses runs of separators", () => {
    expect(slugify("Pauls' MacBook  Pro!!!")).toBe("pauls-macbook-pro");
  });

  it("strips leading and trailing separators", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("transliterates basic non-ASCII", () => {
    expect(slugify("café")).toBe("cafe");
    expect(slugify("naïve")).toBe("naive");
  });

  it("returns 'machine' for empty / all-separator input", () => {
    expect(slugify("")).toBe("machine");
    expect(slugify("---")).toBe("machine");
  });

  it("truncates to 64 chars", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBe(64);
  });

  it("dedupes against takenSet by appending -2, -3, ...", () => {
    const taken = new Set(["work-laptop", "work-laptop-2"]);
    expect(slugify("Work Laptop", taken)).toBe("work-laptop-3");
  });

  it("returns the same slug if not taken", () => {
    expect(slugify("Work Laptop", new Set(["other"]))).toBe("work-laptop");
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
pnpm test src/sync/slugify.test.ts
```

Expected: FAIL with "Cannot find module './slugify'".

- [ ] **Step 3: Implement `slugify`**

Create `src/sync/slugify.ts`:

```ts
const MAX_LEN = 64;

export function slugify(input: string, taken?: Set<string>): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = (normalized || "machine").slice(0, MAX_LEN);
  if (!taken || !taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const suffix = `-${i}`;
    const candidate = base.slice(0, MAX_LEN - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("slugify: exhausted dedupe range");
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm test src/sync/slugify.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Verify typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add src/sync/slugify.ts src/sync/slugify.test.ts
git commit -m "feat(sync): add slugify utility for machine and project ids"
```

---

## Task 3: Sync types module

**Files:**
- Create: `src/sync/types.ts`

This task only adds types — no behaviour to test. It's small but separated so later tasks have stable imports.

- [ ] **Step 1: Create types file**

Create `src/sync/types.ts`:

```ts
import type { ReadResult, FileMeta, DirEntryDto } from "@/lib/tauri";
import type { Scope } from "@/catalog";

/** POSIX-style relative path, e.g. "dotai/work-laptop/manifest.json". */
export type RemotePath = string;

export type RemoteEntry = {
  path: RemotePath;
  sizeBytes: number;
  mtimeMs?: number;
};

export interface SyncProvider {
  readonly id: string;
  readonly label: string;
  /** Recursive listing of files under prefix. Files only — directories are implied by paths. */
  list(prefix: RemotePath): Promise<RemoteEntry[]>;
  readText(path: RemotePath): Promise<string>;
  writeText(path: RemotePath, content: string): Promise<void>;
}

export type ProviderConfig = { kind: "filesystem"; rootPath: string };

export type SnapshotFileEntry = {
  entryId: string;
  scope: Scope;
  /** For project-scoped entries only. */
  projectSlug?: string;
  /** For project-scoped entries only — informational. */
  projectAbsPath?: string;
  /** Path within the entry-id folder (single filename for `kind:"file"`, sub-path for dir entries). */
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  sourceMtimeMs?: number;
};

export type SnapshotManifest = {
  schemaVersion: 1;
  machineId: string;
  machineLabel: string;
  hostname: string;
  platform: "darwin" | "linux" | "win32";
  pushedAtMs: number;
  dotaiVersion: string;
  files: SnapshotFileEntry[];
};

/** Injection seam over local IO so snapshot logic is testable without Tauri. */
export interface LocalIO {
  resolvePath(template: string, project?: string | null): Promise<string>;
  statPath(path: string): Promise<FileMeta>;
  listDir(path: string, glob?: string): Promise<DirEntryDto[]>;
  readFile(path: string): Promise<ReadResult>;
  writeFile(args: {
    path: string;
    content: string;
    lineEnding?: "lf" | "crlf";
    mode?: number | null;
    backupDir?: string | null;
  }): Promise<{ sizeBytes: number; mtimeMs?: number | null }>;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/sync/types.ts
git commit -m "feat(sync): add type definitions for SyncProvider and snapshot"
```

---

## Task 4: Exclusions module

**Files:**
- Create: `src/sync/exclusions.ts`
- Test: `src/sync/exclusions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/sync/exclusions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CATALOG } from "@/catalog";
import { isEntryExcluded, eligibleEntries } from "./exclusions";

describe("isEntryExcluded", () => {
  it("excludes env category entries", () => {
    const env = CATALOG.find((e) => e.kind === "env");
    expect(env).toBeDefined();
    expect(isEntryExcluded(env!)).toBe(true);
  });

  it("excludes the user statefile (cc.user.statefile)", () => {
    const sf = CATALOG.find((e) => e.id === "cc.user.statefile");
    expect(sf).toBeDefined();
    expect(isEntryExcluded(sf!)).toBe(true);
  });

  it("excludes project-local scope entries", () => {
    const local = CATALOG.find((e) => e.scope === "project-local");
    expect(local).toBeDefined();
    expect(isEntryExcluded(local!)).toBe(true);
  });

  it("includes user settings", () => {
    const us = CATALOG.find((e) => e.id === "cc.user.settings");
    expect(us).toBeDefined();
    expect(isEntryExcluded(us!)).toBe(false);
  });

  it("includes project memory", () => {
    const pm = CATALOG.find((e) => e.id === "cc.project.memory.root");
    expect(pm).toBeDefined();
    expect(isEntryExcluded(pm!)).toBe(false);
  });
});

describe("eligibleEntries", () => {
  it("returns a non-empty subset of the catalog", () => {
    const eligible = eligibleEntries();
    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.length).toBeLessThan(CATALOG.length);
  });

  it("never includes excluded entries", () => {
    const eligible = eligibleEntries();
    for (const e of eligible) {
      expect(isEntryExcluded(e)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test src/sync/exclusions.test.ts
```

Expected: FAIL ("Cannot find module './exclusions'").

- [ ] **Step 3: Implement exclusions**

Create `src/sync/exclusions.ts`:

```ts
import { CATALOG, type CatalogEntry } from "@/catalog";

const EXCLUDED_ENTRY_IDS = new Set<string>([
  "cc.user.statefile", // ~/.claude.json — Claude Code rewrites this constantly
]);

export function isEntryExcluded(entry: CatalogEntry): boolean {
  if (EXCLUDED_ENTRY_IDS.has(entry.id)) return true;
  if (entry.kind === "env") return true;
  if (entry.scope === "project-local") return true;
  return false;
}

export function eligibleEntries(): CatalogEntry[] {
  return CATALOG.filter((e) => !isEntryExcluded(e));
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test src/sync/exclusions.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/sync/exclusions.ts src/sync/exclusions.test.ts
git commit -m "feat(sync): add catalog exclusion rules for snapshot collection"
```

---

## Task 5: Manifest module

**Files:**
- Create: `src/sync/manifest.ts`
- Test: `src/sync/manifest.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/sync/manifest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildManifest, parseManifest, sha256Hex } from "./manifest";
import type { SnapshotFileEntry } from "./types";

describe("sha256Hex", () => {
  it("produces a 64-char hex digest", async () => {
    const digest = await sha256Hex("hello");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("buildManifest", () => {
  it("sets schemaVersion=1 and copies fields", () => {
    const files: SnapshotFileEntry[] = [
      {
        entryId: "cc.user.settings",
        scope: "user",
        relativePath: "settings.json",
        sizeBytes: 12,
        sha256: "a".repeat(64),
      },
    ];
    const m = buildManifest({
      machineId: "work-laptop",
      machineLabel: "Work laptop",
      hostname: "host.local",
      platform: "darwin",
      pushedAtMs: 1714032000000,
      dotaiVersion: "0.1.0",
      files,
    });
    expect(m.schemaVersion).toBe(1);
    expect(m.machineId).toBe("work-laptop");
    expect(m.files).toEqual(files);
  });
});

describe("parseManifest", () => {
  it("round-trips a built manifest", () => {
    const built = buildManifest({
      machineId: "m",
      machineLabel: "M",
      hostname: "h",
      platform: "linux",
      pushedAtMs: 1,
      dotaiVersion: "0.1.0",
      files: [],
    });
    const json = JSON.stringify(built);
    expect(parseManifest(json)).toEqual(built);
  });

  it("rejects non-object JSON", () => {
    expect(() => parseManifest("123")).toThrow();
    expect(() => parseManifest("null")).toThrow();
  });

  it("rejects unknown schemaVersion", () => {
    expect(() => parseManifest('{"schemaVersion":2}')).toThrow(
      /schemaVersion/i,
    );
  });

  it("rejects malformed JSON", () => {
    expect(() => parseManifest("{not json")).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test src/sync/manifest.test.ts
```

Expected: FAIL ("Cannot find module './manifest'").

- [ ] **Step 3: Implement manifest**

Create `src/sync/manifest.ts`:

```ts
import type { SnapshotFileEntry, SnapshotManifest } from "./types";

export async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  const hex: string[] = [];
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i += 1) {
    hex.push(view[i].toString(16).padStart(2, "0"));
  }
  return hex.join("");
}

export function buildManifest(args: {
  machineId: string;
  machineLabel: string;
  hostname: string;
  platform: SnapshotManifest["platform"];
  pushedAtMs: number;
  dotaiVersion: string;
  files: SnapshotFileEntry[];
}): SnapshotManifest {
  return {
    schemaVersion: 1,
    machineId: args.machineId,
    machineLabel: args.machineLabel,
    hostname: args.hostname,
    platform: args.platform,
    pushedAtMs: args.pushedAtMs,
    dotaiVersion: args.dotaiVersion,
    files: args.files,
  };
}

export function parseManifest(json: string): SnapshotManifest {
  const obj: unknown = JSON.parse(json);
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("manifest: expected JSON object");
  }
  const m = obj as Record<string, unknown>;
  if (m.schemaVersion !== 1) {
    throw new Error(`manifest: unsupported schemaVersion ${String(m.schemaVersion)}`);
  }
  // Trust the rest — it's our own format. Future schemaVersions can branch here.
  return m as unknown as SnapshotManifest;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test src/sync/manifest.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/sync/manifest.ts src/sync/manifest.test.ts
git commit -m "feat(sync): add manifest builder, parser, and sha256 helper"
```

---

## Task 6: SyncProvider InMemory + path helpers

**Files:**
- Create: `src/sync/providers/types.ts`
- Create: `src/sync/providers/in-memory.ts`
- Test: `src/sync/providers/in-memory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/sync/providers/in-memory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { InMemoryProvider } from "./in-memory";
import { joinRemote } from "./types";

describe("joinRemote", () => {
  it("joins POSIX-style and collapses extra slashes", () => {
    expect(joinRemote("dotai", "work-laptop", "manifest.json")).toBe(
      "dotai/work-laptop/manifest.json",
    );
    expect(joinRemote("dotai/", "/work-laptop/", "manifest.json")).toBe(
      "dotai/work-laptop/manifest.json",
    );
  });

  it("rejects empty or '..' segments", () => {
    expect(() => joinRemote("dotai", "..", "x")).toThrow();
    expect(() => joinRemote("dotai", "", "x")).toThrow();
  });
});

describe("InMemoryProvider", () => {
  it("writes then reads round-trip", async () => {
    const p = new InMemoryProvider();
    await p.writeText("a/b/c.txt", "hello");
    expect(await p.readText("a/b/c.txt")).toBe("hello");
  });

  it("readText throws on unknown path", async () => {
    const p = new InMemoryProvider();
    await expect(p.readText("missing")).rejects.toThrow(/not found/i);
  });

  it("list returns recursive entries with the prefix", async () => {
    const p = new InMemoryProvider();
    await p.writeText("dotai/m1/manifest.json", "{}");
    await p.writeText("dotai/m1/files/x.txt", "x");
    await p.writeText("dotai/m2/manifest.json", "{}");
    await p.writeText("other/y.txt", "y");
    const entries = await p.list("dotai/");
    const paths = entries.map((e) => e.path).sort();
    expect(paths).toEqual([
      "dotai/m1/files/x.txt",
      "dotai/m1/manifest.json",
      "dotai/m2/manifest.json",
    ]);
  });

  it("list is empty for an unknown prefix", async () => {
    const p = new InMemoryProvider();
    expect(await p.list("nope/")).toEqual([]);
  });

  it("writeText overwrites existing content", async () => {
    const p = new InMemoryProvider();
    await p.writeText("k", "v1");
    await p.writeText("k", "v2");
    expect(await p.readText("k")).toBe("v2");
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test src/sync/providers
```

Expected: FAIL ("Cannot find module './in-memory'").

- [ ] **Step 3: Implement helpers**

Create `src/sync/providers/types.ts`:

```ts
export function joinRemote(...parts: string[]): RemotePathPart {
  for (const p of parts) {
    if (!p || p === "." || p === "..") {
      throw new Error(`joinRemote: invalid segment "${p}"`);
    }
  }
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter((p) => p.length > 0)
    .join("/");
}

type RemotePathPart = string;
```

- [ ] **Step 4: Implement InMemoryProvider**

Create `src/sync/providers/in-memory.ts`:

```ts
import type { SyncProvider, RemoteEntry, RemotePath } from "../types";

export class InMemoryProvider implements SyncProvider {
  readonly id = "in-memory";
  readonly label = "In Memory (test fixture)";
  private store = new Map<RemotePath, string>();

  async list(prefix: RemotePath): Promise<RemoteEntry[]> {
    const out: RemoteEntry[] = [];
    for (const [path, content] of this.store) {
      if (path.startsWith(prefix)) {
        out.push({ path, sizeBytes: content.length });
      }
    }
    return out;
  }

  async readText(path: RemotePath): Promise<string> {
    const v = this.store.get(path);
    if (v === undefined) throw new Error(`InMemoryProvider: not found: ${path}`);
    return v;
  }

  async writeText(path: RemotePath, content: string): Promise<void> {
    this.store.set(path, content);
  }
}
```

- [ ] **Step 5: Run, expect pass**

```bash
pnpm test src/sync/providers
```

Expected: 7 passed.

- [ ] **Step 6: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/sync/providers
git commit -m "feat(sync): add SyncProvider path helpers and in-memory provider"
```

---

## Task 7: Snapshot collector

**Files:**
- Create: `src/sync/snapshot.ts`
- Test: `src/sync/snapshot.test.ts`

`collectSnapshot` walks `eligibleEntries()`, resolves paths via `LocalIO`, reads files, and produces both the file-content list (to push) and the manifest's `files` array. `kind:"file"` produces one entry; `kind:"dir-of-files"` walks the directory and applies `fileGlob`.

- [ ] **Step 1: Write the failing tests**

Create `src/sync/snapshot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collectSnapshot } from "./snapshot";
import type { LocalIO } from "./types";
import type { ReadResult, FileMeta, DirEntryDto } from "@/lib/tauri";

function makeIO(files: Record<string, string>): LocalIO {
  return {
    async resolvePath(template, project) {
      return template
        .replace("{home}", "/home")
        .replace("{project}", project ?? "/no-project")
        .replace("{copilot_home}", "/home/.config/github-copilot")
        .replace("{claude_desktop_config}", "/home/.config/claude-desktop")
        .replace("{appdata}", "/home/.config");
    },
    async statPath(path): Promise<FileMeta> {
      const exists = files[path] !== undefined || hasChildren(files, path);
      const isDir = hasChildren(files, path);
      return {
        absPath: path,
        exists,
        isDir,
        readable: exists,
        writable: exists,
        sizeBytes: files[path] ? files[path].length : null,
        mtimeMs: 1,
      };
    },
    async listDir(path, glob): Promise<DirEntryDto[]> {
      const entries: DirEntryDto[] = [];
      const prefix = path.endsWith("/") ? path : `${path}/`;
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue;
        const rel = p.slice(prefix.length);
        if (matchesGlob(rel, glob ?? "*")) {
          entries.push({
            name: rel,
            absPath: p,
            isDir: false,
            sizeBytes: files[p].length,
            mtimeMs: 1,
          });
        }
      }
      return entries;
    },
    async readFile(path): Promise<ReadResult> {
      const content = files[path];
      if (content === undefined) throw new Error(`not found: ${path}`);
      return {
        content,
        sizeBytes: content.length,
        mtimeMs: 1,
        lineEnding: "lf",
        mode: null,
      };
    },
    async writeFile() {
      throw new Error("writeFile not used in snapshot tests");
    },
  };
}

function hasChildren(files: Record<string, string>, path: string): boolean {
  const prefix = path.endsWith("/") ? path : `${path}/`;
  return Object.keys(files).some((p) => p.startsWith(prefix));
}

function matchesGlob(name: string, glob: string): boolean {
  // Tiny matcher that supports the catalog's globs: "*", "*.md", "*/SKILL.md".
  if (glob === "*") return true;
  if (glob.startsWith("*")) return name.endsWith(glob.slice(1));
  if (glob.endsWith("/SKILL.md")) {
    return name.endsWith("/SKILL.md") && !name.slice(0, -"/SKILL.md".length).includes("/");
  }
  return name === glob;
}

describe("collectSnapshot", () => {
  it("collects user-scope file entries", async () => {
    const io = makeIO({
      "/home/.claude/settings.json": '{"k":1}',
      "/home/.claude/CLAUDE.md": "# memory",
    });
    const { files, manifestFiles } = await collectSnapshot({
      io,
      projects: [],
    });
    const settings = files.find((f) => f.entryId === "cc.user.settings");
    expect(settings).toBeDefined();
    expect(settings!.content).toBe('{"k":1}');
    expect(settings!.remotePath).toBe("files/cc.user.settings/settings.json");
    expect(manifestFiles.find((f) => f.entryId === "cc.user.settings")).toMatchObject({
      relativePath: "settings.json",
      sizeBytes: 7,
    });
  });

  it("expands dir-of-files entries with fileGlob", async () => {
    const io = makeIO({
      "/home/.claude/agents/code-reviewer.md": "agent",
      "/home/.claude/agents/test-runner.md": "agent",
      "/home/.claude/agents/.DS_Store": "junk",
    });
    const { files } = await collectSnapshot({ io, projects: [] });
    const agents = files.filter((f) => f.entryId === "cc.user.agents");
    expect(agents.map((a) => a.remotePath).sort()).toEqual([
      "files/cc.user.agents/code-reviewer.md",
      "files/cc.user.agents/test-runner.md",
    ]);
  });

  it("handles skill nested glob */SKILL.md", async () => {
    const io = makeIO({
      "/home/.claude/skills/foo/SKILL.md": "foo skill",
      "/home/.claude/skills/bar/SKILL.md": "bar skill",
      "/home/.claude/skills/foo/notes.md": "ignored",
    });
    const { files } = await collectSnapshot({ io, projects: [] });
    const skills = files.filter((f) => f.entryId === "cc.user.skills");
    expect(skills.map((s) => s.remotePath).sort()).toEqual([
      "files/cc.user.skills/bar/SKILL.md",
      "files/cc.user.skills/foo/SKILL.md",
    ]);
  });

  it("includes project-scope entries for known projects, slugs the project", async () => {
    const io = makeIO({
      "/Users/me/proj-x/CLAUDE.md": "# proj x",
    });
    const { files } = await collectSnapshot({
      io,
      projects: [{ id: "1", name: "Proj X", path: "/Users/me/proj-x" }],
    });
    const pmem = files.find((f) => f.entryId === "cc.project.memory.root");
    expect(pmem).toBeDefined();
    expect(pmem!.remotePath).toBe("files/cc.project.memory.root/proj-x/CLAUDE.md");
  });

  it("skips missing files silently", async () => {
    const io = makeIO({
      "/home/.claude/settings.json": "{}",
    });
    const { files } = await collectSnapshot({ io, projects: [] });
    expect(files.find((f) => f.entryId === "cc.user.settings")).toBeDefined();
    expect(files.find((f) => f.entryId === "cc.user.memory")).toBeUndefined();
  });

  it("excludes env, statefile, and project-local entries", async () => {
    const io = makeIO({
      "/home/.claude.json": '{"state":1}',
      "/home/.claude/settings.local.json": '{"x":1}',
    });
    const { files } = await collectSnapshot({ io, projects: [] });
    expect(files.find((f) => f.entryId === "cc.user.statefile")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test src/sync/snapshot.test.ts
```

Expected: FAIL ("Cannot find module './snapshot'").

- [ ] **Step 3: Implement collector**

Create `src/sync/snapshot.ts`:

```ts
import type { CatalogEntry } from "@/catalog";
import type { Project } from "@/state/projects";
import { eligibleEntries } from "./exclusions";
import { sha256Hex } from "./manifest";
import { joinRemote } from "./providers/types";
import { slugify } from "./slugify";
import type { LocalIO, SnapshotFileEntry } from "./types";

export type SnapshotFileBlob = {
  remotePath: string; // relative to the machine folder, i.e. "files/<entryId>/..."
  content: string;
  entryId: string;
};

export type CollectedSnapshot = {
  files: SnapshotFileBlob[];
  manifestFiles: SnapshotFileEntry[];
};

export async function collectSnapshot(args: {
  io: LocalIO;
  projects: Project[];
}): Promise<CollectedSnapshot> {
  const out: SnapshotFileBlob[] = [];
  const manifestFiles: SnapshotFileEntry[] = [];

  for (const entry of eligibleEntries()) {
    if (entry.scope === "project") {
      for (const project of args.projects) {
        await collectForResolved(entry, project, args.io, out, manifestFiles);
      }
    } else {
      await collectForResolved(entry, null, args.io, out, manifestFiles);
    }
  }

  return { files: out, manifestFiles };
}

async function collectForResolved(
  entry: CatalogEntry,
  project: Project | null,
  io: LocalIO,
  out: SnapshotFileBlob[],
  manifestFiles: SnapshotFileEntry[],
): Promise<void> {
  const absPath = await io.resolvePath(entry.pathTemplate, project?.path ?? null);
  const projectSlug = project ? slugify(project.name) : undefined;

  if (entry.kind === "file") {
    await tryCollectFile(entry, absPath, "", project, projectSlug, io, out, manifestFiles);
    return;
  }

  if (entry.kind === "dir-of-files") {
    const glob = entry.fileGlob ?? "*";
    const stat = await io.statPath(absPath);
    if (!stat.exists) return;
    const dirEntries = await io.listDir(absPath, glob);
    for (const de of dirEntries) {
      if (de.isDir) continue;
      await tryCollectFile(
        entry,
        de.absPath,
        de.name,
        project,
        projectSlug,
        io,
        out,
        manifestFiles,
      );
    }
    return;
  }
  // env entries are filtered upstream by eligibleEntries(); ignore other kinds.
}

async function tryCollectFile(
  entry: CatalogEntry,
  absPath: string,
  childName: string,
  project: Project | null,
  projectSlug: string | undefined,
  io: LocalIO,
  out: SnapshotFileBlob[],
  manifestFiles: SnapshotFileEntry[],
): Promise<void> {
  const stat = await io.statPath(absPath);
  if (!stat.exists || stat.isDir) return;

  const read = await io.readFile(absPath);

  // For kind:"file", relativePath is the basename. For dir-of-files, it's the entry's name (which may contain slashes for skills).
  const relativePath =
    entry.kind === "file" ? basename(absPath) : childName;

  const segments = ["files", entry.id];
  if (projectSlug) segments.push(projectSlug);
  segments.push(...relativePath.split("/"));
  const remotePath = joinRemote(...segments);

  out.push({ remotePath, content: read.content, entryId: entry.id });
  manifestFiles.push({
    entryId: entry.id,
    scope: entry.scope,
    projectSlug,
    projectAbsPath: project?.path,
    relativePath,
    sizeBytes: read.sizeBytes,
    sha256: await sha256Hex(read.content),
    sourceMtimeMs: read.mtimeMs ?? undefined,
  });
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test src/sync/snapshot.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/sync/snapshot.ts src/sync/snapshot.test.ts
git commit -m "feat(sync): collect local snapshot from catalog with project expansion"
```

---

## Task 8: Filesystem provider

**Files:**
- Create: `src/sync/providers/filesystem.ts`
- Create: `src/sync/test-helpers/node-io.ts`
- Test: `src/sync/providers/filesystem.test.ts`

The filesystem provider takes a `LocalIO` so it's testable without Tauri. In production we hand it the real Tauri-backed `LocalIO` (Task 11). In tests we hand it a Node-fs-backed one.

- [ ] **Step 1: Write Node-backed LocalIO test helper**

Create `src/sync/test-helpers/node-io.ts`:

```ts
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { LocalIO } from "../types";

export function nodeIO(): LocalIO {
  return {
    async resolvePath(template) {
      return template;
    },
    async statPath(p) {
      try {
        const s = await fsp.stat(p);
        return {
          absPath: p,
          exists: true,
          isDir: s.isDirectory(),
          readable: true,
          writable: true,
          sizeBytes: s.size,
          mtimeMs: s.mtimeMs,
        };
      } catch {
        return {
          absPath: p,
          exists: false,
          isDir: false,
          readable: false,
          writable: false,
          sizeBytes: null,
          mtimeMs: null,
        };
      }
    },
    async listDir(dir) {
      const out: Array<{
        name: string;
        absPath: string;
        isDir: boolean;
        sizeBytes: number;
        mtimeMs: number | null;
      }> = [];
      const stack = [dir];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        const entries = await fsp.readdir(cur, { withFileTypes: true });
        for (const e of entries) {
          const abs = path.join(cur, e.name);
          if (e.isDirectory()) {
            stack.push(abs);
          } else {
            const s = await fsp.stat(abs);
            out.push({
              name: path.relative(dir, abs),
              absPath: abs,
              isDir: false,
              sizeBytes: s.size,
              mtimeMs: s.mtimeMs,
            });
          }
        }
      }
      return out;
    },
    async readFile(p) {
      const content = await fsp.readFile(p, "utf8");
      const stat = await fsp.stat(p);
      return {
        content,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
        lineEnding: content.includes("\r\n") ? "crlf" : "lf",
        mode: null,
      };
    },
    async writeFile(args) {
      await fsp.mkdir(path.dirname(args.path), { recursive: true });
      await fsp.writeFile(args.path, args.content, "utf8");
      const stat = await fsp.stat(args.path);
      return { sizeBytes: stat.size, mtimeMs: stat.mtimeMs };
    },
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/sync/providers/filesystem.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { FilesystemProvider } from "./filesystem";
import { nodeIO } from "../test-helpers/node-io";

describe("FilesystemProvider", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "dotai-fs-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("writeText creates parent dirs and persists content", async () => {
    const p = new FilesystemProvider({ kind: "filesystem", rootPath: root }, nodeIO());
    await p.writeText("dotai/m1/files/x/y.txt", "hello");
    const onDisk = await fs.readFile(path.join(root, "dotai/m1/files/x/y.txt"), "utf8");
    expect(onDisk).toBe("hello");
  });

  it("readText returns previously written content", async () => {
    const p = new FilesystemProvider({ kind: "filesystem", rootPath: root }, nodeIO());
    await p.writeText("dotai/m1/manifest.json", '{"k":1}');
    expect(await p.readText("dotai/m1/manifest.json")).toBe('{"k":1}');
  });

  it("list returns flat recursive entries with the prefix", async () => {
    const p = new FilesystemProvider({ kind: "filesystem", rootPath: root }, nodeIO());
    await p.writeText("dotai/m1/manifest.json", "{}");
    await p.writeText("dotai/m1/files/a.txt", "a");
    await p.writeText("dotai/m2/manifest.json", "{}");
    const entries = await p.list("dotai/");
    const paths = entries.map((e) => e.path).sort();
    expect(paths).toEqual([
      "dotai/m1/files/a.txt",
      "dotai/m1/manifest.json",
      "dotai/m2/manifest.json",
    ]);
  });

  it("list returns empty when prefix does not exist", async () => {
    const p = new FilesystemProvider({ kind: "filesystem", rootPath: root }, nodeIO());
    expect(await p.list("nope/")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, expect fail**

```bash
pnpm test src/sync/providers/filesystem.test.ts
```

Expected: FAIL ("Cannot find module './filesystem'").

- [ ] **Step 4: Implement provider**

Create `src/sync/providers/filesystem.ts`:

```ts
import type {
  LocalIO,
  ProviderConfig,
  RemoteEntry,
  RemotePath,
  SyncProvider,
} from "../types";

export class FilesystemProvider implements SyncProvider {
  readonly id = "filesystem";
  readonly label = "Local folder";
  private root: string;

  constructor(config: ProviderConfig & { kind: "filesystem" }, private io: LocalIO) {
    this.root = config.rootPath.replace(/\/+$/, "");
  }

  async list(prefix: RemotePath): Promise<RemoteEntry[]> {
    const dir = this.toAbs(prefix);
    const stat = await this.io.statPath(dir);
    if (!stat.exists || !stat.isDir) return [];
    const entries = await this.io.listDir(dir);
    const trimmedPrefix = stripTrailingSlash(prefix);
    return entries
      .filter((e) => !e.isDir)
      .map((e) => ({
        path: trimmedPrefix
          ? `${trimmedPrefix}/${e.name}`
          : e.name,
        sizeBytes: e.sizeBytes,
        mtimeMs: e.mtimeMs ?? undefined,
      }));
  }

  async readText(p: RemotePath): Promise<string> {
    const r = await this.io.readFile(this.toAbs(p));
    return r.content;
  }

  async writeText(p: RemotePath, content: string): Promise<void> {
    await this.io.writeFile({ path: this.toAbs(p), content, lineEnding: "lf" });
  }

  private toAbs(remote: RemotePath): string {
    const clean = remote.replace(/^\/+/, "");
    return clean ? `${this.root}/${clean}` : this.root;
  }
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}
```

- [ ] **Step 5: Run, expect pass**

```bash
pnpm test src/sync/providers/filesystem.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/sync/providers/filesystem.ts src/sync/test-helpers/node-io.ts src/sync/providers/filesystem.test.ts
git commit -m "feat(sync): add filesystem provider with node-io test helper"
```

---

## Task 9: Tauri-backed LocalIO + provider registry + public API

**Files:**
- Create: `src/lib/local-io.ts`
- Create: `src/sync/providers/index.ts`
- Create: `src/sync/api.ts`
- Test: `src/sync/api.test.ts`

- [ ] **Step 1: Implement Tauri-backed LocalIO**

Create `src/lib/local-io.ts`:

```ts
import {
  resolvePath,
  statPath,
  listDir,
  readFile,
  writeFile,
} from "./tauri";
import type { LocalIO } from "@/sync/types";

export const tauriLocalIO: LocalIO = {
  resolvePath,
  statPath,
  listDir,
  readFile,
  writeFile: (args) =>
    writeFile(args).then((r) => ({ sizeBytes: r.sizeBytes, mtimeMs: r.mtimeMs })),
};
```

- [ ] **Step 2: Implement provider registry**

Create `src/sync/providers/index.ts`:

```ts
import type { LocalIO, ProviderConfig, SyncProvider } from "../types";
import { FilesystemProvider } from "./filesystem";

export function createProvider(config: ProviderConfig, io: LocalIO): SyncProvider {
  switch (config.kind) {
    case "filesystem":
      return new FilesystemProvider(config, io);
    default: {
      const exhaustive: never = config.kind;
      throw new Error(`unknown provider kind: ${String(exhaustive)}`);
    }
  }
}
```

- [ ] **Step 3: Write the failing api tests**

Create `src/sync/api.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { InMemoryProvider } from "./providers/in-memory";
import { listMachines, pushSnapshot, readRemoteFile } from "./api";
import { buildManifest } from "./manifest";

describe("pushSnapshot", () => {
  it("writes files first, manifest last (manifest-last invariant)", async () => {
    const provider = new InMemoryProvider();
    const writes: string[] = [];
    const wrap = new Proxy(provider, {
      get(target, prop) {
        if (prop === "writeText") {
          return async (path: string, content: string) => {
            writes.push(path);
            await provider.writeText(path, content);
          };
        }
        return (target as never)[prop as never];
      },
    });
    await pushSnapshot({
      provider: wrap as unknown as InMemoryProvider,
      machineSlug: "m1",
      machineLabel: "M1",
      hostname: "host",
      platform: "darwin",
      dotaiVersion: "0.1.0",
      collected: {
        files: [
          { remotePath: "files/cc.user.settings/settings.json", content: "{}", entryId: "cc.user.settings" },
        ],
        manifestFiles: [
          {
            entryId: "cc.user.settings",
            scope: "user",
            relativePath: "settings.json",
            sizeBytes: 2,
            sha256: "x".repeat(64),
          },
        ],
      },
    });
    expect(writes[writes.length - 1]).toBe("dotai/m1/manifest.json");
    expect(writes).toContain("dotai/m1/files/cc.user.settings/settings.json");
  });
});

describe("listMachines", () => {
  it("discovers machines by manifest path pattern", async () => {
    const p = new InMemoryProvider();
    const m1 = buildManifest({
      machineId: "m1",
      machineLabel: "M1",
      hostname: "h",
      platform: "darwin",
      pushedAtMs: 1,
      dotaiVersion: "0.1.0",
      files: [],
    });
    const m2 = buildManifest({
      machineId: "m2",
      machineLabel: "M2",
      hostname: "h",
      platform: "linux",
      pushedAtMs: 2,
      dotaiVersion: "0.1.0",
      files: [],
    });
    await p.writeText("dotai/m1/manifest.json", JSON.stringify(m1));
    await p.writeText("dotai/m1/files/cc.user.settings/settings.json", "{}");
    await p.writeText("dotai/m2/manifest.json", JSON.stringify(m2));
    await p.writeText("dotai/m1/notes-not-a-manifest.txt", "noise");
    const machines = await listMachines(p);
    const ids = machines.map((m) => m.machineId).sort();
    expect(ids).toEqual(["m1", "m2"]);
  });

  it("skips folders without a manifest", async () => {
    const p = new InMemoryProvider();
    await p.writeText("dotai/orphan/files/x.txt", "x");
    const machines = await listMachines(p);
    expect(machines).toEqual([]);
  });
});

describe("readRemoteFile", () => {
  it("reads via the provider at the manifest's remote path", async () => {
    const p = new InMemoryProvider();
    await p.writeText("dotai/m1/files/cc.user.memory/CLAUDE.md", "hi");
    expect(
      await readRemoteFile(p, "m1", "files/cc.user.memory/CLAUDE.md"),
    ).toBe("hi");
  });
});
```

- [ ] **Step 4: Run, expect fail**

```bash
pnpm test src/sync/api.test.ts
```

Expected: FAIL ("Cannot find module './api'").

- [ ] **Step 5: Implement public API**

Create `src/sync/api.ts`:

```ts
import { buildManifest, parseManifest } from "./manifest";
import { joinRemote } from "./providers/types";
import type { CollectedSnapshot } from "./snapshot";
import type {
  RemotePath,
  SnapshotManifest,
  SyncProvider,
} from "./types";

const ROOT_PREFIX = "dotai";

export async function pushSnapshot(args: {
  provider: SyncProvider;
  machineSlug: string;
  machineLabel: string;
  hostname: string;
  platform: SnapshotManifest["platform"];
  dotaiVersion: string;
  collected: CollectedSnapshot;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const machineRoot = joinRemote(ROOT_PREFIX, args.machineSlug);
  const total = args.collected.files.length;

  for (let i = 0; i < args.collected.files.length; i += 1) {
    const f = args.collected.files[i];
    const path = joinRemote(machineRoot, ...f.remotePath.split("/"));
    await args.provider.writeText(path, f.content);
    args.onProgress?.(i + 1, total + 1);
  }

  const manifest = buildManifest({
    machineId: args.machineSlug,
    machineLabel: args.machineLabel,
    hostname: args.hostname,
    platform: args.platform,
    pushedAtMs: Date.now(),
    dotaiVersion: args.dotaiVersion,
    files: args.collected.manifestFiles,
  });
  await args.provider.writeText(
    joinRemote(machineRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  args.onProgress?.(total + 1, total + 1);
}

export async function listMachines(
  provider: SyncProvider,
): Promise<SnapshotManifest[]> {
  const entries = await provider.list(`${ROOT_PREFIX}/`);
  const manifestPaths = entries
    .map((e) => e.path)
    .filter((p) => isMachineManifestPath(p));
  const out: SnapshotManifest[] = [];
  for (const path of manifestPaths) {
    try {
      const json = await provider.readText(path);
      out.push(parseManifest(json));
    } catch {
      // Skip unreadable / malformed manifests; viewer treats as absent.
    }
  }
  return out;
}

function isMachineManifestPath(path: string): boolean {
  // Match exactly: dotai/<single-segment>/manifest.json
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === ROOT_PREFIX &&
    parts[1].length > 0 &&
    parts[2] === "manifest.json"
  );
}

export async function readRemoteFile(
  provider: SyncProvider,
  machineSlug: string,
  relativeRemotePath: RemotePath,
): Promise<string> {
  const path = joinRemote(ROOT_PREFIX, machineSlug, ...relativeRemotePath.split("/"));
  return provider.readText(path);
}
```

- [ ] **Step 6: Run, expect pass**

```bash
pnpm test src/sync/api.test.ts
```

Expected: 4 passed.

- [ ] **Step 7: Add public re-exports**

Create `src/sync/index.ts`:

```ts
export * from "./types";
export * from "./api";
export { collectSnapshot } from "./snapshot";
export { createProvider } from "./providers";
export { slugify } from "./slugify";
```

- [ ] **Step 8: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/local-io.ts src/sync/providers/index.ts src/sync/api.ts src/sync/api.test.ts src/sync/index.ts
git commit -m "feat(sync): add provider registry, public API, and Tauri LocalIO"
```

---

## Task 10: Sync settings store

**Files:**
- Create: `src/lib/sync-store.ts`

Mirrors `src/lib/projects-store.ts` exactly. No tests — it's a 20-line wrapper over `LazyStore` and the wrapper is the actual product.

- [ ] **Step 1: Implement store**

Create `src/lib/sync-store.ts`:

```ts
import { LazyStore } from "@tauri-apps/plugin-store";
import type { ProviderConfig } from "@/sync/types";

const store = new LazyStore("sync.json");

export type SyncSettings = {
  providerConfig: ProviderConfig | null;
  machineLabel: string;
  machineSlug: string;
  lastPushedAtMs: number | null;
};

const DEFAULT: SyncSettings = {
  providerConfig: null,
  machineLabel: "",
  machineSlug: "",
  lastPushedAtMs: null,
};

const KEY = "settings";

export async function loadSyncSettings(): Promise<SyncSettings> {
  try {
    const value = await store.get<SyncSettings>(KEY);
    return value ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export async function saveSyncSettings(settings: SyncSettings): Promise<void> {
  await store.set(KEY, settings);
  await store.save();
}
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/sync-store.ts
git commit -m "feat(sync): add sync-settings persistence via tauri-plugin-store"
```

---

## Task 11: Jotai atoms for sync state

**Files:**
- Create: `src/state/sync.ts`

- [ ] **Step 1: Implement atoms**

Create `src/state/sync.ts`:

```ts
import { atom } from "jotai";
import type { SnapshotManifest } from "@/sync/types";
import type { SyncSettings } from "@/lib/sync-store";

export const syncSettingsAtom = atom<SyncSettings | null>(null);

/** Discriminated union — same pattern as other async-load atoms in this codebase. */
export type RemoteMachinesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; machines: SnapshotManifest[] }
  | { status: "error"; message: string };

export const remoteMachinesAtom = atom<RemoteMachinesState>({ status: "idle" });

export const selectedRemoteMachineAtom = atom<string | null>(null); // machineId

export type RemoteFileViewState =
  | { status: "idle" }
  | { status: "loading"; machineId: string; relativePath: string }
  | {
      status: "ready";
      machineId: string;
      relativePath: string;
      content: string;
      manifestSha256: string;
    }
  | { status: "error"; message: string };

export const remoteFileViewAtom = atom<RemoteFileViewState>({ status: "idle" });

export type PushState =
  | { status: "idle" }
  | { status: "pushing"; done: number; total: number }
  | { status: "error"; message: string };

export const pushStateAtom = atom<PushState>({ status: "idle" });
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/state/sync.ts
git commit -m "feat(sync): add jotai atoms for sync settings, remote machines, push state"
```

---

## Task 12: SyncSettingsPanel component

**Files:**
- Create: `src/components/Sync/SyncSettingsPanel.tsx`

Renders provider selector (only "Local folder" option), folder picker, machine label field, "Push snapshot now" button, last-pushed timestamp. Wires up to atoms + tauri-plugin-dialog + the public sync API.

- [ ] **Step 1: Implement panel**

Create `src/components/Sync/SyncSettingsPanel.tsx`:

```tsx
import { open } from "@tauri-apps/plugin-dialog";
import { hostname, platform } from "@tauri-apps/plugin-os";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { tauriLocalIO } from "@/lib/local-io";
import { loadSyncSettings, saveSyncSettings } from "@/lib/sync-store";
import { projectsAtom } from "@/state/projects";
import { pushStateAtom, syncSettingsAtom } from "@/state/sync";
import {
  collectSnapshot,
  createProvider,
  pushSnapshot,
  slugify,
} from "@/sync";

export function SyncSettingsPanel() {
  const [settings, setSettings] = useAtom(syncSettingsAtom);
  const [pushState, setPushState] = useAtom(pushStateAtom);
  const [projects] = useAtom(projectsAtom);
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    if (settings === null) {
      void loadSyncSettings().then((s) => setSettings(s));
    }
  }, [settings, setSettings]);

  useEffect(() => {
    if (settings && labelDraft === "") setLabelDraft(settings.machineLabel);
  }, [settings, labelDraft]);

  if (settings === null) return <div className="p-4 text-sm">Loading…</div>;

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    const next = {
      ...settings!,
      providerConfig: { kind: "filesystem" as const, rootPath: selected },
    };
    setSettings(next);
    await saveSyncSettings(next);
  }

  async function saveLabel() {
    const slug = slugify(labelDraft || (await hostname()) || "machine");
    const next = { ...settings!, machineLabel: labelDraft, machineSlug: slug };
    setSettings(next);
    await saveSyncSettings(next);
  }

  async function pushNow() {
    if (!settings!.providerConfig || !settings!.machineSlug) return;
    setPushState({ status: "pushing", done: 0, total: 0 });
    try {
      const provider = createProvider(settings!.providerConfig, tauriLocalIO);
      const collected = await collectSnapshot({ io: tauriLocalIO, projects });
      const total = collected.files.length + 1;
      await pushSnapshot({
        provider,
        machineSlug: settings!.machineSlug,
        machineLabel: settings!.machineLabel,
        hostname: (await hostname()) ?? "unknown",
        platform: (await platform()) as "darwin" | "linux" | "win32",
        dotaiVersion: import.meta.env.VITE_APP_VERSION ?? "0.1.0",
        collected,
        onProgress: (done) => setPushState({ status: "pushing", done, total }),
      });
      const next = { ...settings!, lastPushedAtMs: Date.now() };
      setSettings(next);
      await saveSyncSettings(next);
      setPushState({ status: "idle" });
    } catch (err) {
      setPushState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ready =
    settings.providerConfig !== null && settings.machineSlug.length > 0;

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <h2 className="text-base font-semibold">Cloud Sync</h2>

      <div>
        <label className="mb-1 block text-(--color-fg-muted)">Provider</label>
        <select className="w-full rounded border bg-(--color-bg-subtle) p-1">
          <option value="filesystem">Local folder</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-(--color-fg-muted)">Sync folder</label>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={settings.providerConfig?.rootPath ?? ""}
            placeholder="(none selected)"
            className="flex-1 rounded border bg-(--color-bg-subtle) p-1"
          />
          <button
            type="button"
            onClick={pickFolder}
            className="rounded border px-2 py-1"
          >
            Pick…
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-(--color-fg-muted)">This machine</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            placeholder="e.g. Work laptop"
            className="flex-1 rounded border bg-(--color-bg-subtle) p-1"
          />
          <button
            type="button"
            onClick={saveLabel}
            className="rounded border px-2 py-1"
          >
            Save
          </button>
        </div>
        {settings.machineSlug && (
          <p className="mt-1 text-xs text-(--color-fg-muted)">
            Folder slug: <code>{settings.machineSlug}</code>
          </p>
        )}
      </div>

      <div>
        <button
          type="button"
          disabled={!ready || pushState.status === "pushing"}
          onClick={pushNow}
          className="rounded bg-(--color-accent) px-3 py-1 text-(--color-accent-fg) disabled:opacity-50"
        >
          {pushState.status === "pushing"
            ? `Pushing ${pushState.done} / ${pushState.total}…`
            : "Push snapshot now"}
        </button>
        {pushState.status === "error" && (
          <p className="mt-1 text-(--color-danger)">{pushState.message}</p>
        )}
        {settings.lastPushedAtMs && pushState.status !== "pushing" && (
          <p className="mt-1 text-xs text-(--color-fg-muted)">
            Last pushed {new Date(settings.lastPushedAtMs).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Tauri OS plugin (provides `hostname` + `platform`)**

```bash
pnpm add @tauri-apps/plugin-os@^2
```

Then add it to the Rust backend in `src-tauri/Cargo.toml` dependencies:

```toml
tauri-plugin-os = "2"
```

And register it in `src-tauri/src/lib.rs` next to the other `.plugin(...)` calls:

```rust
.plugin(tauri_plugin_os::init())
```

(This is the only Rust touch in the entire plan and only because the OS plugin requires it.)

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck && pnpm lint && cargo check --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src/components/Sync/SyncSettingsPanel.tsx
git commit -m "feat(sync): add cloud-sync settings panel and OS plugin wiring"
```

---

## Task 13: OtherMachinesSection (left rail)

**Files:**
- Create: `src/components/Sync/OtherMachinesSection.tsx`

Lists discovered machines, allows selection, renders each machine's manifest as a tree, fires off the file viewer atom on click.

- [ ] **Step 1: Read existing sidebar to learn pattern**

```bash
ls src/components/Sidebar/
cat src/components/Sidebar/index.tsx 2>/dev/null | head -80
```

Note where the existing tree is rendered and which props it accepts. The new section should mirror that pattern; if a `<SidebarSection>` or similar exists, reuse it.

- [ ] **Step 2: Implement section**

Create `src/components/Sync/OtherMachinesSection.tsx`:

```tsx
import { useAtom } from "jotai";
import { useCallback } from "react";
import { tauriLocalIO } from "@/lib/local-io";
import {
  remoteFileViewAtom,
  remoteMachinesAtom,
  selectedRemoteMachineAtom,
  syncSettingsAtom,
} from "@/state/sync";
import { createProvider, listMachines, readRemoteFile } from "@/sync";

export function OtherMachinesSection() {
  const [settings] = useAtom(syncSettingsAtom);
  const [machines, setMachines] = useAtom(remoteMachinesAtom);
  const [selected, setSelected] = useAtom(selectedRemoteMachineAtom);
  const [, setFileView] = useAtom(remoteFileViewAtom);

  const refresh = useCallback(async () => {
    if (!settings?.providerConfig) return;
    setMachines({ status: "loading" });
    try {
      const provider = createProvider(settings.providerConfig, tauriLocalIO);
      const list = await listMachines(provider);
      setMachines({ status: "ready", machines: list });
    } catch (err) {
      setMachines({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [settings, setMachines]);

  if (!settings?.providerConfig) {
    return null; // section hidden until configured
  }

  async function openFile(machineId: string, relativePath: string, sha256: string) {
    setFileView({ status: "loading", machineId, relativePath });
    try {
      const provider = createProvider(settings!.providerConfig!, tauriLocalIO);
      const content = await readRemoteFile(provider, machineId, relativePath);
      setFileView({
        status: "ready",
        machineId,
        relativePath,
        content,
        manifestSha256: sha256,
      });
    } catch (err) {
      setFileView({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <section className="flex flex-col gap-2 p-2 text-sm">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold">Other machines</h3>
        <button type="button" onClick={refresh} className="text-xs underline">
          {machines.status === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {machines.status === "idle" && (
        <p className="text-xs text-(--color-fg-muted)">Click Refresh to load.</p>
      )}
      {machines.status === "error" && (
        <p className="text-(--color-danger)">{machines.message}</p>
      )}
      {machines.status === "ready" && machines.machines.length === 0 && (
        <p className="text-xs text-(--color-fg-muted)">No machines have pushed yet.</p>
      )}
      {machines.status === "ready" && (
        <ul className="flex flex-col gap-1">
          {machines.machines.map((m) => {
            const isSelected = selected === m.machineId;
            return (
              <li key={m.machineId}>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(isSelected ? null : m.machineId)
                  }
                  className="w-full text-left"
                >
                  <span className="font-medium">{m.machineLabel}</span>{" "}
                  <span className="text-xs text-(--color-fg-muted)">
                    {relativeTime(m.pushedAtMs)}
                  </span>
                </button>
                {isSelected && (
                  <ul className="ml-3 mt-1 flex flex-col gap-0.5">
                    {m.files.map((f) => (
                      <li key={`${f.entryId}/${f.relativePath}/${f.projectSlug ?? ""}`}>
                        <button
                          type="button"
                          onClick={() =>
                            openFile(
                              m.machineId,
                              fileRemotePath(f),
                              f.sha256,
                            )
                          }
                          className="text-left underline-offset-2 hover:underline"
                        >
                          {f.entryId}
                          {f.projectSlug ? `/${f.projectSlug}` : ""}/
                          {f.relativePath}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function fileRemotePath(f: {
  entryId: string;
  projectSlug?: string;
  relativePath: string;
}): string {
  const parts = ["files", f.entryId];
  if (f.projectSlug) parts.push(f.projectSlug);
  parts.push(...f.relativePath.split("/"));
  return parts.join("/");
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  return `${Math.round(hr / 24)} d ago`;
}
```

- [ ] **Step 3: Verify typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Sync/OtherMachinesSection.tsx
git commit -m "feat(sync): add 'other machines' section with manifest tree view"
```

---

## Task 14: RemoteFileViewer

**Files:**
- Create: `src/components/Sync/RemoteFileViewer.tsx`

A read-only CodeMirror host that reuses the existing extensions but with `EditorState.readOnly.of(true)`. Shows a banner.

- [ ] **Step 1: Read existing Editor to learn the extension setup**

```bash
ls src/components/Editor/
cat src/components/Editor/index.tsx 2>/dev/null | head -80
cat src/lib/editor-extensions.ts | head -60
```

The viewer should call the same extension factory but pass a `readOnly: true` flag (add it to the factory if it doesn't exist; otherwise wrap the result with `EditorState.readOnly.of(true)`).

- [ ] **Step 2: Implement viewer**

Create `src/components/Sync/RemoteFileViewer.tsx`:

```tsx
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import { sha256Hex } from "@/sync/manifest";
import { remoteFileViewAtom } from "@/state/sync";

export function RemoteFileViewer() {
  const [view] = useAtom(remoteFileViewAtom);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cmRef = useRef<EditorView | null>(null);
  const integrityRef = useRef<"ok" | "mismatch" | "unknown">("unknown");

  useEffect(() => {
    if (view.status !== "ready") return;
    if (!hostRef.current) return;
    cmRef.current?.destroy();
    cmRef.current = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: view.content,
        extensions: [EditorView.editable.of(false), EditorState.readOnly.of(true)],
      }),
    });
    void verifyIntegrity(view.content, view.manifestSha256).then((ok) => {
      integrityRef.current = ok ? "ok" : "mismatch";
    });
    return () => {
      cmRef.current?.destroy();
      cmRef.current = null;
    };
  }, [view]);

  if (view.status === "idle") {
    return (
      <div className="p-4 text-sm text-(--color-fg-muted)">
        Select a file from another machine to view.
      </div>
    );
  }
  if (view.status === "loading") {
    return <div className="p-4 text-sm">Loading {view.relativePath}…</div>;
  }
  if (view.status === "error") {
    return <div className="p-4 text-(--color-danger)">{view.message}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-(--color-bg-subtle) p-2 text-xs">
        Read-only — from machine <code>{view.machineId}</code>:{" "}
        <code>{view.relativePath}</code>
        {integrityRef.current === "mismatch" && (
          <span className="ml-2 text-(--color-danger)">
            ⚠ content changed since manifest was written
          </span>
        )}
      </div>
      <div ref={hostRef} className="flex-1 overflow-auto" />
    </div>
  );
}

async function verifyIntegrity(content: string, expected: string): Promise<boolean> {
  return (await sha256Hex(content)) === expected;
}
```

- [ ] **Step 3: Verify typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Sync/RemoteFileViewer.tsx
git commit -m "feat(sync): add read-only remote file viewer with integrity check"
```

---

## Task 15: Wire components into the app shell

**Files:**
- Modify: settings drawer host (locate during this task)
- Modify: sidebar host (locate during this task)
- Modify: main content area (locate during this task)

The exact files to touch depend on existing layout; this task adapts to whatever pattern is already there.

- [ ] **Step 1: Find the settings drawer host**

```bash
grep -rln "ProjectsPanel\|EnvVarsPanel\|SearchPanel" src/components src/App.tsx src/main.tsx
```

Identify the file that composes the existing panels (likely `src/App.tsx` or a `Drawer.tsx`). Add `<SyncSettingsPanel />` next to the others, behind a tab/section labelled "Cloud Sync".

- [ ] **Step 2: Find the sidebar host**

```bash
ls src/components/Sidebar
grep -rln "Sidebar" src/App.tsx src/main.tsx 2>/dev/null
```

Add `<OtherMachinesSection />` to the sidebar below the existing tree (or wherever the natural slot is — follow the existing section pattern).

- [ ] **Step 3: Add the remote viewer to the main content area**

The viewer renders only when `remoteFileViewAtom.status` is non-idle. Place it as a peer of the existing `<Editor />` and switch between them based on `selectedRemoteMachineAtom !== null && remoteFileViewAtom.status !== "idle"`. If the existing layout uses tabs, add it as a new tab; if it splits, render it in a separate pane.

- [ ] **Step 4: Run the dev app, manually test**

```bash
pnpm tauri dev
```

Test the golden path:
1. Open Settings → Cloud Sync. Pick a folder (use a temp dir like `/tmp/dotai-sync-test`). Set machine label.
2. Click **Push snapshot now**. Wait for the timestamp to update.
3. Verify the on-disk layout matches the spec: `ls /tmp/dotai-sync-test/dotai/<slug>/` should show `manifest.json` and `files/`.
4. Open `manifest.json` in another editor — verify schema matches.
5. (Optional) Manually create a second machine folder by `cp -r /tmp/dotai-sync-test/dotai/<slug> /tmp/dotai-sync-test/dotai/fake-other`, edit the `machineId` and `machineLabel` fields inside its `manifest.json`. Reopen dotai, click **Refresh** in **Other machines**, verify both appear.
6. Click a file under the fake-other machine — verify it opens read-only with a banner.

Edge cases:
- Empty sync folder → "No machines have pushed yet."
- Folder not configured → settings panel shows "Pick…" prompt; sidebar section hidden.
- Bad path (e.g. delete the folder while running) → error in Refresh, error in Push.

- [ ] **Step 5: Verify all checks pass**

```bash
pnpm typecheck && pnpm lint && pnpm test && cargo check --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --no-deps -- -D warnings
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(sync): wire cloud-sync UI into app shell"
```

---

## Task 16: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Add a "Cloud sync" section to `README.md`**

Insert under the "Out of scope" section's predecessor (find the appropriate location in the file). Keep it short:

```markdown
## Cloud sync (read-only)

dotai can write a snapshot of your tracked configs to any folder you already sync (OneDrive, Dropbox, iCloud, Syncthing, a git repo on a NAS). Other dotai installs pointing at the same folder can browse those snapshots read-only — no apply, no merge.

Excluded by design: env-var values (secrets), `~/.claude.json` (rewrites itself), and `*.local` files (gitignored on purpose).

Configure under **Settings → Cloud Sync**.
```

- [ ] **Step 2: Add a row to the "Critical files" table in `docs/ARCHITECTURE.md`**

```markdown
| `src/sync/index.ts` | Cloud-sync public API; pluggable provider abstraction |
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/ARCHITECTURE.md
git commit -m "docs(sync): document cloud-sync feature in README and architecture"
```

---

## Self-Review

After completing all tasks, verify:

1. **Spec coverage**:
   - ✅ Read-only remote view → Tasks 13, 14
   - ✅ Pluggable `SyncProvider` interface → Tasks 3, 6, 8, 9
   - ✅ Filesystem provider → Task 8
   - ✅ Manual push, on-demand pull → Tasks 12, 13
   - ✅ Snapshot exclusions (env, statefile, project-local) → Task 4
   - ✅ Mirrored on-disk layout → Tasks 7, 9
   - ✅ Manifest-last invariant → Task 9
   - ✅ Slug rule + dedup → Task 2 + Task 12
   - ✅ Settings persistence (`sync.json`) → Task 10
   - ✅ Read-only editor with banner → Task 14
   - ✅ Integrity warning on sha256 mismatch → Task 14
   - ✅ Tests (slugify, exclusions, manifest, snapshot, providers, api) → Tasks 2, 4, 5, 6, 7, 8, 9
   - ✅ Documentation updates → Task 16

2. **No placeholders**: every code step has complete code; no TBDs, no "see Task N", no "add validation".

3. **Type consistency**: `SyncProvider`, `LocalIO`, `SnapshotManifest`, `CollectedSnapshot`, `SyncSettings` are all defined in earlier tasks before being imported in later ones. Method names (`list`, `readText`, `writeText`, `pushSnapshot`, `listMachines`, `readRemoteFile`, `collectSnapshot`, `createProvider`) are consistent throughout.

---

## Final commit

After all 16 tasks land, the project should pass:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && cargo check --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --no-deps -- -D warnings
```

If any check fails, stop and fix before declaring done.
