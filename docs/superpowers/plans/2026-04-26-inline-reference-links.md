# Inline Reference Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@$HOME/...` (and similar) references in skill / workflow / CLAUDE.md files clickable in dotai's CodeMirror source view and markdown preview, navigating to the target file inside the dotai editor (even when the target isn't in the static catalog).

**Architecture:** A pure parser (`src/lib/refs.ts`) that finds reference ranges and resolves them to absolute paths. Two renderers consume those ranges: a CodeMirror `ViewPlugin` for source view (cmd-click to navigate) and a `react-markdown` `<a>` component override for preview view. Targets outside the catalog are opened via a synthetic `CatalogEntry` carried on the `Selection` atom, so the existing Editor + atomic-save plumbing keeps working.

**Tech Stack:** TypeScript, vitest, CodeMirror 6 (`@codemirror/view`, `@codemirror/state`), react-markdown / remark-gfm, Jotai, Tauri 2 (`getPathTokens()` for `$HOME`).

**Spec:** `docs/superpowers/specs/2026-04-26-inline-reference-links-design.md`

---

## File map

**Created:**

- `src/lib/refs.ts` — parser, resolver, and combined `findRefs()` API.
- `src/lib/refs.test.ts` — vitest unit tests for the above.
- `src/lib/ad-hoc.ts` — `entryForPath()` synthetic entry factory + extension→language map.
- `src/lib/ad-hoc.test.ts` — vitest unit tests for the above.
- `src/lib/codemirror-refs.ts` — CodeMirror extension factory `refsExtension({ contextDir, homeDir, onOpen })`.
- `src/lib/open-ref.ts` — `nextSelectionForPath()` selection-update helper.
- `src/lib/open-ref.test.ts` — vitest unit tests for the above.

**Modified:**

- `src/catalog/types.ts` — add `"adhoc"` to the `Category` union and `CATEGORY_LABELS`.
- `src/state/selection.ts` — add optional `syntheticEntry?: CatalogEntry` field; add `homeDirAtom`.
- `src/App.tsx` — populate `homeDirAtom` from `getPathTokens()` at startup.
- `src/lib/editor-extensions.ts` — `extensionsForEntry(entry, ctx)` accepts a `RefsContext` and passes it to the new CM extension.
- `src/components/Editor/index.tsx` — derive `entry` from `selection.syntheticEntry` when `entryId` is null; pass `RefsContext` to `extensionsForEntry`; conditionally hide Docs button when `entry.docsUrl` is empty; pass an `openRef` callback to `MarkdownPreview`.
- `src/components/Editor/MarkdownPreview.tsx` — accept `onOpenRef` prop; add a remark plugin that wraps detected refs in link nodes with `dotai-ref:` URLs; route `dotai-ref:` clicks via `onOpenRef` instead of `openDocs`.

---

## Task 1: Pure ref parser (`parseRefs`)

**Files:**

- Create: `src/lib/refs.ts`
- Test: `src/lib/refs.test.ts`

- [ ] **Step 1: Write failing tests for `parseRefs`**

Create `src/lib/refs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseRefs } from "./refs";

describe("parseRefs — @-prefix references", () => {
  it("detects @$HOME/...", () => {
    const text = "see @$HOME/.claude/foo.md for details";
    expect(parseRefs(text, { detectBackticks: false })).toEqual([
      { start: 4, end: 25, raw: "@$HOME/.claude/foo.md" },
    ]);
  });

  it("detects @${HOME}/...", () => {
    const text = "see @${HOME}/.claude/foo.md for details";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs).toHaveLength(1);
    expect(refs[0].raw).toBe("@${HOME}/.claude/foo.md");
  });

  it("detects @~/...", () => {
    const text = "see @~/.claude/foo.md.";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs).toHaveLength(1);
    // Trailing period is stripped from the captured ref.
    expect(refs[0].raw).toBe("@~/.claude/foo.md");
    expect(refs[0].start).toBe(4);
    expect(refs[0].end).toBe(21);
  });

  it("detects absolute @/foo/bar.md", () => {
    const text = "@/Users/x/foo.md is here";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs[0].raw).toBe("@/Users/x/foo.md");
  });

  it("detects relative @./foo.md and @../bar.md", () => {
    const text = "@./foo.md and @../bar.md";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs.map((r) => r.raw)).toEqual(["@./foo.md", "@../bar.md"]);
  });

  it("strips trailing punctuation .,;:)", () => {
    const text = "ref @~/foo.md, then @~/bar.md; and @~/baz.md.";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs.map((r) => r.raw)).toEqual([
      "@~/foo.md",
      "@~/bar.md",
      "@~/baz.md",
    ]);
  });

  it("does not match @ without a path-prefix", () => {
    const text = "email me @ alice or version @v1";
    expect(parseRefs(text, { detectBackticks: false })).toEqual([]);
  });

  it("treats escaped tilde \\~/ as literal text", () => {
    const text = "literal @\\~/foo.md";
    expect(parseRefs(text, { detectBackticks: false })).toEqual([]);
  });

  it("supports multiple refs on one line", () => {
    const text = "@~/a.md @~/b.md @~/c.md";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs).toHaveLength(3);
  });

  it("terminates at line ends", () => {
    const text = "@~/foo.md\n@~/bar.md";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs).toHaveLength(2);
    expect(refs[0].raw).toBe("@~/foo.md");
    expect(refs[1].raw).toBe("@~/bar.md");
  });
});

describe("parseRefs — backtick paths", () => {
  it("detects `~/foo.md` when detectBackticks is true", () => {
    const text = "open `~/foo.md` to see";
    const refs = parseRefs(text, { detectBackticks: true });
    expect(refs).toHaveLength(1);
    expect(refs[0].raw).toBe("`~/foo.md`");
  });

  it("detects `/abs/path` and `./rel/path`", () => {
    const text = "`/etc/hosts` and `./README.md`";
    const refs = parseRefs(text, { detectBackticks: true });
    expect(refs.map((r) => r.raw)).toEqual(["`/etc/hosts`", "`./README.md`"]);
  });

  it("ignores backticks that don't look like paths", () => {
    const text = "`useState` and `git status`";
    expect(parseRefs(text, { detectBackticks: true })).toEqual([]);
  });

  it("skips fenced code blocks", () => {
    const text = [
      "see `~/before.md`",
      "```",
      "echo `~/inside.md`",
      "```",
      "and `~/after.md`",
    ].join("\n");
    const refs = parseRefs(text, { detectBackticks: true });
    expect(refs.map((r) => r.raw)).toEqual([
      "`~/before.md`",
      "`~/after.md`",
    ]);
  });

  it("skips ~~~ fenced code blocks", () => {
    const text = "~~~\n`~/inside.md`\n~~~\n`~/after.md`";
    const refs = parseRefs(text, { detectBackticks: true });
    expect(refs.map((r) => r.raw)).toEqual(["`~/after.md`"]);
  });

  it("does not detect backtick refs when detectBackticks is false", () => {
    const text = "see `~/foo.md` here";
    expect(parseRefs(text, { detectBackticks: false })).toEqual([]);
  });

  it("requires a path separator (rejects `~` alone)", () => {
    const text = "literal `~` tilde";
    expect(parseRefs(text, { detectBackticks: true })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm test src/lib/refs.test.ts`
Expected: every test fails with "Cannot find module './refs'" or similar.

- [ ] **Step 3: Implement `parseRefs`**

Create `src/lib/refs.ts`:

```ts
export type RefMatch = {
  start: number;
  end: number;
  raw: string;
};

export type ParseOptions = {
  detectBackticks: boolean;
};

// @-prefix: @ followed by one of the path anchors, then path chars.
// Anchors: $HOME, ${HOME}, ~, ., .., or a literal /.
// Stops at whitespace. Trailing .,;:) are stripped post-match.
const AT_REF_REGEX =
  /(?<![\\\w])@(\$HOME|\$\{HOME\}|~|\.|\.\.|)(\/[^\s`]*)/g;

const TRAILING_PUNCT = /[.,;:)]+$/;

// Backtick paths: a single-backtick span whose content starts with a
// known path anchor and contains a separator.
const BACKTICK_REGEX = /`((?:~|\.{1,2}|\$HOME|\$\{HOME\})\/[^`\n]*)`/g;

// Matches an opening or closing fenced-code-block line. Captures the fence
// for closing-pair matching (``` opens iff ``` closes; same for ~~~).
const FENCE_LINE = /^(```|~~~)/;

function rangesInsideFences(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let cursor = 0;
  let openFence: string | null = null;
  let openOffset = 0;
  for (const line of text.split("\n")) {
    const m = line.match(FENCE_LINE);
    if (m) {
      if (openFence === null) {
        openFence = m[1];
        openOffset = cursor;
      } else if (line.startsWith(openFence)) {
        ranges.push([openOffset, cursor + line.length]);
        openFence = null;
      }
    }
    cursor += line.length + 1; // +1 for the newline that split() consumed
  }
  if (openFence !== null) {
    ranges.push([openOffset, text.length]);
  }
  return ranges;
}

function isInside(ranges: Array<[number, number]>, pos: number): boolean {
  for (const [a, b] of ranges) {
    if (pos >= a && pos < b) return true;
  }
  return false;
}

export function parseRefs(text: string, opts: ParseOptions): RefMatch[] {
  const matches: RefMatch[] = [];
  const fences = opts.detectBackticks ? rangesInsideFences(text) : [];

  for (const m of text.matchAll(AT_REF_REGEX)) {
    const start = m.index ?? 0;
    let raw = m[0];
    // Strip trailing punctuation from the matched range.
    const trail = raw.match(TRAILING_PUNCT);
    if (trail) raw = raw.slice(0, raw.length - trail[0].length);
    matches.push({ start, end: start + raw.length, raw });
  }

  if (opts.detectBackticks) {
    for (const m of text.matchAll(BACKTICK_REGEX)) {
      const start = m.index ?? 0;
      if (isInside(fences, start)) continue;
      const raw = m[0];
      matches.push({ start, end: start + raw.length, raw });
    }
  }

  matches.sort((a, b) => a.start - b.start);
  return matches;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test src/lib/refs.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/refs.ts src/lib/refs.test.ts
git commit -m "feat(refs): add parseRefs for @-prefix and backtick path references"
```

---

## Task 2: Path resolver (`resolveRefPath`)

**Files:**

- Modify: `src/lib/refs.ts`
- Modify: `src/lib/refs.test.ts`

- [ ] **Step 1: Add failing resolver tests**

Append to `src/lib/refs.test.ts`:

```ts
import { resolveRefPath } from "./refs";

describe("resolveRefPath", () => {
  const home = "/Users/alice";

  it("expands @$HOME/...", () => {
    expect(resolveRefPath("@$HOME/.claude/foo.md", { home, contextDir: null }))
      .toBe("/Users/alice/.claude/foo.md");
  });

  it("expands @${HOME}/...", () => {
    expect(resolveRefPath("@${HOME}/.claude/foo.md", { home, contextDir: null }))
      .toBe("/Users/alice/.claude/foo.md");
  });

  it("expands @~/...", () => {
    expect(resolveRefPath("@~/.claude/foo.md", { home, contextDir: null }))
      .toBe("/Users/alice/.claude/foo.md");
  });

  it("returns absolute @/... unchanged (normalised)", () => {
    expect(resolveRefPath("@/etc/hosts", { home, contextDir: null }))
      .toBe("/etc/hosts");
  });

  it("resolves @./foo.md against contextDir", () => {
    expect(
      resolveRefPath("@./bar.md", {
        home,
        contextDir: "/Users/alice/project/sub",
      }),
    ).toBe("/Users/alice/project/sub/bar.md");
  });

  it("resolves @../bar.md against contextDir", () => {
    expect(
      resolveRefPath("@../bar.md", {
        home,
        contextDir: "/Users/alice/project/sub",
      }),
    ).toBe("/Users/alice/project/bar.md");
  });

  it("normalises .. and . segments", () => {
    expect(
      resolveRefPath("@$HOME/foo/../bar/./baz.md", { home, contextDir: null }),
    ).toBe("/Users/alice/bar/baz.md");
  });

  it("strips a #fragment from the path", () => {
    expect(resolveRefPath("@~/foo.md#section", { home, contextDir: null }))
      .toBe("/Users/alice/foo.md");
  });

  it("resolves backtick refs identically", () => {
    expect(resolveRefPath("`~/foo.md`", { home, contextDir: null }))
      .toBe("/Users/alice/foo.md");
    expect(
      resolveRefPath("`./bar.md`", {
        home,
        contextDir: "/Users/alice/sub",
      }),
    ).toBe("/Users/alice/sub/bar.md");
  });

  it("returns null when relative ref has no contextDir", () => {
    expect(resolveRefPath("@./foo.md", { home, contextDir: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm test src/lib/refs.test.ts`
Expected: resolver tests fail with "resolveRefPath is not a function".

- [ ] **Step 3: Implement `resolveRefPath`**

Append to `src/lib/refs.ts`:

```ts
export type ResolveContext = {
  home: string;
  contextDir: string | null;
};

// Normalises a posix-style path: collapses ., .., and double slashes.
// Always returns an absolute path (no trailing slash unless root).
function normalisePath(path: string): string {
  const parts = path.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0) out.pop();
      continue;
    }
    out.push(part);
  }
  return "/" + out.join("/");
}

function unwrap(raw: string): string {
  if (raw.startsWith("`") && raw.endsWith("`")) return raw.slice(1, -1);
  if (raw.startsWith("@")) return raw.slice(1);
  return raw;
}

export function resolveRefPath(
  raw: string,
  ctx: ResolveContext,
): string | null {
  let body = unwrap(raw);
  // Strip #fragment.
  const hash = body.indexOf("#");
  if (hash >= 0) body = body.slice(0, hash);

  // Substitute home anchors.
  if (body.startsWith("$HOME/")) {
    return normalisePath(ctx.home + "/" + body.slice("$HOME/".length));
  }
  if (body.startsWith("${HOME}/")) {
    return normalisePath(ctx.home + "/" + body.slice("${HOME}/".length));
  }
  if (body.startsWith("~/")) {
    return normalisePath(ctx.home + "/" + body.slice(2));
  }
  if (body.startsWith("/")) {
    return normalisePath(body);
  }
  if (body.startsWith("./") || body.startsWith("../")) {
    if (!ctx.contextDir) return null;
    return normalisePath(ctx.contextDir + "/" + body);
  }
  return null;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test src/lib/refs.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/refs.ts src/lib/refs.test.ts
git commit -m "feat(refs): add resolveRefPath with home/relative/absolute resolution"
```

---

## Task 3: Combined `findRefs` API

**Files:**

- Modify: `src/lib/refs.ts`
- Modify: `src/lib/refs.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/lib/refs.test.ts`:

```ts
import { findRefs } from "./refs";

describe("findRefs", () => {
  const home = "/Users/alice";

  it("combines parseRefs and resolveRefPath", () => {
    const text = "see @~/foo.md and `./bar.md` here";
    const result = findRefs(text, {
      home,
      contextDir: "/Users/alice/proj",
      detectBackticks: true,
    });
    expect(result).toEqual([
      {
        start: 4,
        end: 13,
        raw: "@~/foo.md",
        absolutePath: "/Users/alice/foo.md",
      },
      {
        start: 18,
        end: 28,
        raw: "`./bar.md`",
        absolutePath: "/Users/alice/proj/bar.md",
      },
    ]);
  });

  it("drops refs that fail to resolve", () => {
    // @./foo.md without a contextDir resolves to null.
    const text = "@./foo.md and @~/bar.md";
    const result = findRefs(text, {
      home,
      contextDir: null,
      detectBackticks: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].absolutePath).toBe("/Users/alice/bar.md");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm test src/lib/refs.test.ts`
Expected: `findRefs is not a function`.

- [ ] **Step 3: Implement `findRefs`**

Append to `src/lib/refs.ts`:

```ts
export type ResolvedRef = RefMatch & { absolutePath: string };

export type FindRefsContext = ResolveContext & {
  detectBackticks: boolean;
};

export function findRefs(text: string, ctx: FindRefsContext): ResolvedRef[] {
  const out: ResolvedRef[] = [];
  for (const m of parseRefs(text, { detectBackticks: ctx.detectBackticks })) {
    const abs = resolveRefPath(m.raw, ctx);
    if (abs !== null) out.push({ ...m, absolutePath: abs });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test src/lib/refs.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/refs.ts src/lib/refs.test.ts
git commit -m "feat(refs): add findRefs combining parsing and resolution"
```

---

## Task 4: Synthetic catalog entry (`entryForPath`)

**Files:**

- Create: `src/lib/ad-hoc.ts`
- Create: `src/lib/ad-hoc.test.ts`
- Modify: `src/catalog/types.ts` (extend `Category` with `"adhoc"`)

- [ ] **Step 1: Extend `Category` to include `"adhoc"`**

Edit `src/catalog/types.ts`. Add `"adhoc"` to the `Category` union and `CATEGORY_LABELS`.

```ts
export type Category =
  | "settings"
  | "memory"
  | "mcp"
  | "agents"
  | "commands"
  | "skills"
  | "hooks"
  | "rules"
  | "plugins"
  | "keybindings"
  | "env"
  | "adhoc";
```

```ts
export const CATEGORY_LABELS: Record<Category, string> = {
  settings: "Settings",
  memory: "Memory",
  mcp: "MCP",
  agents: "Agents",
  commands: "Commands",
  skills: "Skills",
  hooks: "Hooks",
  rules: "Rules",
  plugins: "Plugins",
  keybindings: "Keybindings",
  env: "Environment",
  adhoc: "Linked file",
};
```

- [ ] **Step 2: Write failing tests for `entryForPath`**

Create `src/lib/ad-hoc.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { entryForPath, languageFromExtension } from "./ad-hoc";

describe("languageFromExtension", () => {
  it("maps .md to markdown", () => {
    expect(languageFromExtension(".md")).toBe("markdown");
  });
  it("maps .markdown to markdown", () => {
    expect(languageFromExtension(".markdown")).toBe("markdown");
  });
  it("maps .json to json", () => {
    expect(languageFromExtension(".json")).toBe("json");
  });
  it("maps .jsonc and .json5 to jsonc", () => {
    expect(languageFromExtension(".jsonc")).toBe("jsonc");
    expect(languageFromExtension(".json5")).toBe("jsonc");
  });
  it("maps .toml to toml", () => {
    expect(languageFromExtension(".toml")).toBe("toml");
  });
  it("falls back to markdown for unknown extensions", () => {
    expect(languageFromExtension(".sh")).toBe("markdown");
    expect(languageFromExtension("")).toBe("markdown");
  });
});

describe("entryForPath", () => {
  it("returns a synthetic entry with the basename as label", () => {
    const e = entryForPath("/Users/alice/.claude/skills/foo/SKILL.md");
    expect(e.id).toBe("adhoc:/Users/alice/.claude/skills/foo/SKILL.md");
    expect(e.label).toBe("SKILL.md");
    expect(e.kind).toBe("file");
    expect(e.language).toBe("markdown");
    expect(e.docsUrl).toBe("");
    expect(e.category).toBe("adhoc");
    expect(e.pathTemplate).toBe("/Users/alice/.claude/skills/foo/SKILL.md");
  });

  it("uses the file extension to pick a language", () => {
    expect(entryForPath("/x/y/foo.json").language).toBe("json");
    expect(entryForPath("/x/y/foo.toml").language).toBe("toml");
  });
});
```

- [ ] **Step 2 (cont.): Run tests to confirm they fail**

Run: `pnpm test src/lib/ad-hoc.test.ts`
Expected: import errors.

- [ ] **Step 3: Implement `ad-hoc.ts`**

Create `src/lib/ad-hoc.ts`:

```ts
import type { CatalogEntry, Language } from "@/catalog";

export function languageFromExtension(ext: string): Language {
  switch (ext.toLowerCase()) {
    case ".md":
    case ".markdown":
      return "markdown";
    case ".json":
      return "json";
    case ".jsonc":
    case ".json5":
      return "jsonc";
    case ".toml":
      return "toml";
    default:
      // No syntax highlighting beyond basicSetup. We pick "markdown" because
      // the markdown plugin tolerates arbitrary text without breaking, and
      // most ad-hoc files we follow refs into are markdown anyway.
      return "markdown";
  }
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx < 0 ? path : path.slice(idx + 1);
}

function extname(path: string): string {
  const base = basename(path);
  const idx = base.lastIndexOf(".");
  return idx <= 0 ? "" : base.slice(idx);
}

export function entryForPath(absolutePath: string): CatalogEntry {
  return {
    id: `adhoc:${absolutePath}`,
    tool: "claude-code",
    scope: "user",
    category: "adhoc",
    label: basename(absolutePath),
    pathTemplate: absolutePath,
    kind: "file",
    language: languageFromExtension(extname(absolutePath)),
    docsUrl: "",
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test src/lib/ad-hoc.test.ts && pnpm typecheck`
Expected: tests pass; typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/types.ts src/lib/ad-hoc.ts src/lib/ad-hoc.test.ts
git commit -m "feat(catalog): add entryForPath synthetic entry for ad-hoc files"
```

---

## Task 5: Extend `Selection` to carry a synthetic entry

**Files:**

- Modify: `src/state/selection.ts`

- [ ] **Step 1: Add the optional field**

Edit `src/state/selection.ts`:

```ts
import { atom } from "jotai";
import type { ToolId, Scope, CatalogEntry } from "@/catalog";

export type Selection = {
  tool: ToolId | null;
  scope: Scope | null;
  entryId: string | null;
  filePath: string | null;
  syntheticEntry?: CatalogEntry;
};

export const selectionAtom = atom<Selection>({
  tool: null,
  scope: null,
  entryId: null,
  filePath: null,
});

export const projectAtom = atom<string | null>(null);
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: pass. The `?` field is purely additive and existing readers ignore it.

- [ ] **Step 3: Commit**

```bash
git add src/state/selection.ts
git commit -m "feat(selection): allow Selection to carry a synthetic entry"
```

---

## Task 6: `nextSelectionForPath` helper

**Files:**

- Create: `src/lib/open-ref.ts`
- Create: `src/lib/open-ref.test.ts`

A pure helper so source view and preview view share the same logic. For v1 it always produces a synthetic-entry selection; catalog lookup is deferred (catalog path resolution is async via `resolvePath`, so it would need a separately-maintained index — out of scope here). The function takes an optional sync lookup so we can layer on an index later without churning the API.

- [ ] **Step 1: Write a failing test**

Create `src/lib/open-ref.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nextSelectionForPath } from "./open-ref";
import type { Selection } from "@/state/selection";

const base: Selection = {
  tool: null,
  scope: null,
  entryId: "claude-code-user-claudemd",
  filePath: "/Users/alice/CLAUDE.md",
};

describe("nextSelectionForPath", () => {
  it("returns a synthetic-entry selection when no lookup is given", () => {
    const next = nextSelectionForPath("/Users/alice/.claude/skills/x/SKILL.md", base);
    expect(next.entryId).toBeNull();
    expect(next.filePath).toBe("/Users/alice/.claude/skills/x/SKILL.md");
    expect(next.syntheticEntry?.id).toBe(
      "adhoc:/Users/alice/.claude/skills/x/SKILL.md",
    );
    expect(next.syntheticEntry?.label).toBe("SKILL.md");
  });

  it("uses the catalog lookup when one is provided and matches", () => {
    const next = nextSelectionForPath("/etc/hosts", base, {
      findCatalogEntryByPath: (p) =>
        p === "/etc/hosts"
          ? {
              id: "demo",
              tool: "claude-code",
              scope: "user",
              category: "settings",
              label: "hosts",
              pathTemplate: "/etc/hosts",
              kind: "file",
              language: "json",
              docsUrl: "https://example.com",
            }
          : null,
    });
    expect(next.entryId).toBe("demo");
    expect(next.filePath).toBe("/etc/hosts");
    expect(next.syntheticEntry).toBeUndefined();
  });

  it("falls back to synthetic when the lookup returns null", () => {
    const next = nextSelectionForPath("/nope/x.md", base, {
      findCatalogEntryByPath: () => null,
    });
    expect(next.entryId).toBeNull();
    expect(next.syntheticEntry?.id).toBe("adhoc:/nope/x.md");
  });
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `pnpm test src/lib/open-ref.test.ts`
Expected: import error.

- [ ] **Step 3: Implement `nextSelectionForPath`**

Create `src/lib/open-ref.ts`:

```ts
import { entryForPath } from "@/lib/ad-hoc";
import type { CatalogEntry } from "@/catalog";
import type { Selection } from "@/state/selection";

export type OpenRefDeps = {
  // Optional sync lookup: given an absolute path, return a real catalog entry
  // that resolves to it, or null. When omitted, every navigation produces a
  // synthetic-entry selection. v1 omits it; a future change can add a
  // resolved-path index and pass it through here without an API change.
  findCatalogEntryByPath?: (absolutePath: string) => CatalogEntry | null;
};

export function nextSelectionForPath(
  absolutePath: string,
  current: Selection,
  deps: OpenRefDeps = {},
): Selection {
  const real = deps.findCatalogEntryByPath?.(absolutePath) ?? null;
  if (real) {
    return {
      tool: real.tool,
      scope: real.scope,
      entryId: real.id,
      filePath: absolutePath,
    };
  }
  return {
    tool: current.tool,
    scope: current.scope,
    entryId: null,
    filePath: absolutePath,
    syntheticEntry: entryForPath(absolutePath),
  };
}
```

- [ ] **Step 4: Confirm tests pass**

Run: `pnpm test src/lib/open-ref.test.ts && pnpm typecheck`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/open-ref.ts src/lib/open-ref.test.ts
git commit -m "feat(refs): add nextSelectionForPath helper"
```

---

## Task 7: CodeMirror ref-link extension

**Files:**

- Create: `src/lib/codemirror-refs.ts`

Manual-test only — CM extensions are awkward to unit-test without a DOM. We rely on the unit-tested `findRefs` and verify the integration in the smoke test (Task 11).

- [ ] **Step 1: Implement the extension**

Create `src/lib/codemirror-refs.ts`:

```ts
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import { findRefs, type ResolvedRef } from "@/lib/refs";

export type RefsContext = {
  home: string;
  contextDir: string | null;
  detectBackticks: boolean;
  onOpen: (absolutePath: string) => void;
};

const REF_CLASS = "cm-ref-link";

function buildDecorations(
  view: EditorView,
  ctx: RefsContext,
): { decos: DecorationSet; refs: ResolvedRef[] } {
  const text = view.state.doc.toString();
  const refs = findRefs(text, ctx);
  const builder = new RangeSetBuilder<Decoration>();
  const mark = Decoration.mark({ class: REF_CLASS });
  for (const r of refs) {
    builder.add(r.start, r.end, mark);
  }
  return { decos: builder.finish(), refs };
}

function refAtPos(refs: ResolvedRef[], pos: number): ResolvedRef | null {
  for (const r of refs) {
    if (pos >= r.start && pos < r.end) return r;
  }
  return null;
}

export function refsExtension(ctx: RefsContext): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      refs: ResolvedRef[];

      constructor(view: EditorView) {
        const built = buildDecorations(view, ctx);
        this.decorations = built.decos;
        this.refs = built.refs;
      }

      update(u: ViewUpdate) {
        if (u.docChanged) {
          const built = buildDecorations(u.view, ctx);
          this.decorations = built.decos;
          this.refs = built.refs;
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        click(this: { refs: ResolvedRef[] }, ev: MouseEvent, view: EditorView) {
          // cmd-click on macOS / ctrl-click elsewhere
          const isMod = ev.metaKey || ev.ctrlKey;
          if (!isMod) return false;
          const pos = view.posAtCoords({ x: ev.clientX, y: ev.clientY });
          if (pos === null) return false;
          const ref = refAtPos(this.refs, pos);
          if (!ref) return false;
          ev.preventDefault();
          ctx.onOpen(ref.absolutePath);
          return true;
        },
      },
    },
  );

  const tooltip = hoverTooltip((view, pos) => {
    const value = view.plugin(plugin);
    if (!value) return null;
    const ref = refAtPos(value.refs, pos);
    if (!ref) return null;
    return {
      pos: ref.start,
      end: ref.end,
      above: true,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "cm-ref-tooltip";
        dom.textContent = ref.absolutePath;
        return { dom };
      },
    };
  });

  const theme = EditorView.theme({
    [`.${REF_CLASS}`]: {
      color: "var(--color-accent)",
      textDecoration: "underline dotted",
      textUnderlineOffset: "2px",
    },
    [`.${REF_CLASS}:hover`]: {
      textDecoration: "underline solid",
    },
    ".cm-ref-tooltip": {
      background: "var(--color-bg-subtle)",
      border: "1px solid var(--color-border)",
      borderRadius: "4px",
      padding: "4px 8px",
      fontSize: "11px",
      fontFamily: "var(--font-mono, monospace)",
      color: "var(--color-fg)",
      maxWidth: "60ch",
      wordBreak: "break-all",
    },
  });

  return [plugin, tooltip, theme];
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/codemirror-refs.ts
git commit -m "feat(editor): add CodeMirror extension for ref decorations"
```

---

## Task 8: Wire CM extension into `extensionsForEntry`

**Files:**

- Modify: `src/lib/editor-extensions.ts`

- [ ] **Step 1: Update the signature and wire the extension**

Edit `src/lib/editor-extensions.ts`. Add the `RefsContext` parameter and include `refsExtension(ctx)` in the returned extensions.

Add to the imports at the top:

```ts
import { refsExtension, type RefsContext } from "@/lib/codemirror-refs";
```

Change the function signature and body:

```ts
export function extensionsForEntry(
  entry: CatalogEntry,
  refsCtx: RefsContext | null,
): Extension[] {
  const refs = refsCtx ? [refsExtension(refsCtx)] : [];
  switch (entry.language) {
    case "json":
    case "jsonc":
      return [
        ...jsonExtension(entry.schemaId ? getSchema(entry.schemaId) : undefined),
        ...refs,
      ];
    case "markdown":
      return [
        markdown(),
        syntaxHighlighting(markdownHeadingStyle),
        ...lintExtensionForMarkdown(),
        ...refs,
      ];
    default:
      return [...refs];
  }
}
```

- [ ] **Step 2: Verify typecheck (callers will fail until updated)**

Run: `pnpm typecheck`
Expected: error in `src/components/Editor/index.tsx` because the call site is missing the new arg. That's expected — Task 9 fixes it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/editor-extensions.ts
git commit -m "feat(editor): plumb refs context through extensionsForEntry"
```

---

## Task 9: Editor integration

**Files:**

- Modify: `src/components/Editor/index.tsx`

This task does several small things at once because they're all coupled to a single render path:

1. Resolve the `entry` from either the catalog or `selection.syntheticEntry`.
2. Build a `RefsContext` (from `getPathTokens()` + the file's parent dir + an `openRef` callback) and pass it to `extensionsForEntry`.
3. Hide the Docs button when `entry.docsUrl` is empty.
4. Pass the `openRef` callback to `MarkdownPreview` (we'll wire it up in Task 10).

- [ ] **Step 1: Add an atom for the home dir**

Append to `src/state/selection.ts`:

```ts
export const homeDirAtom = atom<string | null>(null);
```

Then in `src/App.tsx` (or wherever app-level effects run — find the existing `getPathTokens()` consumer and add a sibling effect that sets this atom). Locate the existing call (e.g. in `src/lib/backup.ts`) and import `getPathTokens` similarly.

In `src/App.tsx`, near the top of the component, add:

```tsx
import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { homeDirAtom } from "@/state/selection";
import { getPathTokens } from "@/lib/tauri";

// Inside the App component:
const setHomeDir = useSetAtom(homeDirAtom);
useEffect(() => {
  let cancelled = false;
  void getPathTokens().then((t) => {
    if (!cancelled) setHomeDir(t.home);
  });
  return () => { cancelled = true; };
}, [setHomeDir]);
```

- [ ] **Step 2: Update `Editor` to derive entry, build refs context, hide empty Docs**

Edit `src/components/Editor/index.tsx`. Specific changes:

Change the entry resolution (around line 47):

```tsx
const selection = useAtomValue(selectionAtom);
const homeDir = useAtomValue(homeDirAtom);
const setSelection = useSetAtom(selectionAtom);
// ... existing atoms ...

const entry = selection.entryId
  ? entryById(selection.entryId)
  : (selection.syntheticEntry ?? null);
```

Add new imports:

```tsx
import { homeDirAtom, selectionAtom } from "@/state/selection";
import { nextSelectionForPath } from "@/lib/open-ref";
import type { RefsContext } from "@/lib/codemirror-refs";
```

Build the `openRef` callback (no catalog lookup in v1 — see Task 6):

```tsx
const openRef = useCallback(
  (absolutePath: string) => {
    setSelection((cur) => nextSelectionForPath(absolutePath, cur));
  },
  [setSelection],
);
```

Build the `RefsContext` and feed it to `extensionsForEntry`. Replace the `extensions` useMemo:

```tsx
const refsCtx = useMemo<RefsContext | null>(() => {
  if (!filePath || !homeDir) return null;
  const lastSlash = filePath.lastIndexOf("/");
  const contextDir = lastSlash >= 0 ? filePath.slice(0, lastSlash) : null;
  return {
    home: homeDir,
    contextDir,
    detectBackticks: entry?.language === "markdown",
    onOpen: openRef,
  };
}, [filePath, homeDir, entry?.language, openRef]);

const extensions = useMemo<Extension[]>(() => {
  if (!entry) return [];
  return [
    basicSetup,
    ...extensionsForEntry(entry, refsCtx),
    EditorState.readOnly.of(!editable),
    EditorView.editable.of(editable),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          void save();
          return true;
        },
      },
    ]),
  ];
}, [entry, editable, onChange, save, refsCtx]);
```

Hide the Docs button when `docsUrl` is empty. Find the existing button (around lines 496–502) and wrap it:

```tsx
{entry.docsUrl && (
  <button
    type="button"
    onClick={() => openDocs(entry.docsUrl)}
    className="flex items-center gap-1 text-(--color-accent) hover:underline"
  >
    Docs <ExternalLink size={11} />
  </button>
)}
```

Pass `openRef` to `MarkdownPreview`. Find the `<MarkdownPreview source={...} />` line (around line 555):

```tsx
<MarkdownPreview source={buffer?.currentContent ?? ""} onOpenRef={openRef} />
```

- [ ] **Step 3: Verify and smoke-test**

Run:

```
pnpm typecheck
pnpm lint
```

Expected: both pass. (Linting may flag unused imports — clean those up.)

- [ ] **Step 4: Commit**

```bash
git add src/components/Editor/index.tsx src/state/selection.ts src/App.tsx
git commit -m "feat(editor): wire ref clicks into selection navigation"
```

---

## Task 10: Markdown preview ref handling

**Files:**

- Modify: `src/components/Editor/MarkdownPreview.tsx`

The preview uses `react-markdown` with `remark-gfm` and `rehype-sanitize`. We add a remark plugin that walks the tree, splits `text` nodes around `@`-refs, and converts qualifying `inlineCode` nodes into link nodes. Refs use a `dotai-ref:` URL scheme so the existing `<a>` override can route them.

- [ ] **Step 1: Add the remark plugin and wire `onOpenRef`**

Replace `src/components/Editor/MarkdownPreview.tsx` (whole file shown for clarity):

```tsx
import { Component, type AnchorHTMLAttributes, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useAtomValue } from "jotai";
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Text, Link, InlineCode } from "mdast";
import { isAbsoluteUrl, stripFrontmatter } from "@/lib/markdown";
import { openDocs } from "@/lib/docs-links";
import { findRefs, parseRefs, resolveRefPath } from "@/lib/refs";
import { homeDirAtom, selectionAtom } from "@/state/selection";

type Props = { source: string; onOpenRef?: (absolutePath: string) => void };

type AnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string };

const REF_SCHEME = "dotai-ref:";

function makeRefAnchor(onOpenRef: ((path: string) => void) | undefined) {
  return function PreviewAnchor({ href, children, ...rest }: AnchorProps) {
    if (href && href.startsWith(REF_SCHEME)) {
      const target = href.slice(REF_SCHEME.length);
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            onOpenRef?.(target);
          }}
          title={target}
          className="cm-ref-link"
          {...rest}
        >
          {children}
        </a>
      );
    }
    if (isAbsoluteUrl(href)) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            if (href) void openDocs(href);
          }}
          {...rest}
        >
          {children}
        </a>
      );
    }
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
}

// remark plugin: rewrite text + inlineCode nodes that contain refs into
// link nodes whose href is `dotai-ref:<absolute>`.
function remarkRefs(opts: {
  home: string | null;
  contextDir: string | null;
}): Plugin<[], Root> {
  return () => (tree) => {
    if (!opts.home) return;
    visit(tree, (node, index, parent) => {
      if (!parent || index === undefined) return;

      if (node.type === "text") {
        const text = (node as Text).value;
        const matches = parseRefs(text, { detectBackticks: false });
        if (matches.length === 0) return;
        const newNodes: Array<Text | Link> = [];
        let cursor = 0;
        for (const m of matches) {
          const abs = resolveRefPath(m.raw, {
            home: opts.home!,
            contextDir: opts.contextDir,
          });
          if (abs === null) continue;
          if (m.start > cursor) {
            newNodes.push({ type: "text", value: text.slice(cursor, m.start) });
          }
          newNodes.push({
            type: "link",
            url: REF_SCHEME + abs,
            title: abs,
            children: [{ type: "text", value: m.raw }],
          });
          cursor = m.end;
        }
        if (cursor < text.length) {
          newNodes.push({ type: "text", value: text.slice(cursor) });
        }
        parent.children.splice(index, 1, ...newNodes);
      } else if (node.type === "inlineCode") {
        const value = (node as InlineCode).value;
        // Wrap the value in backticks for findRefs (it expects the raw form).
        const refs = findRefs(`\`${value}\``, {
          home: opts.home!,
          contextDir: opts.contextDir,
          detectBackticks: true,
        });
        if (refs.length !== 1) return;
        const ref = refs[0];
        const linkNode: Link = {
          type: "link",
          url: REF_SCHEME + ref.absolutePath,
          title: ref.absolutePath,
          children: [{ type: "inlineCode", value }],
        };
        parent.children.splice(index, 1, linkNode);
      }
    });
  };
}

// Allow the `dotai-ref:` scheme through rehype-sanitize.
const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "dotai-ref"],
  },
};

class PreviewErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="markdown-preview p-4 text-xs text-(--color-danger)">
          Failed to render preview: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function MarkdownPreview({ source, onOpenRef }: Props) {
  const homeDir = useAtomValue(homeDirAtom);
  const selection = useAtomValue(selectionAtom);
  const filePath = selection.filePath;
  const lastSlash = filePath ? filePath.lastIndexOf("/") : -1;
  const contextDir =
    filePath && lastSlash >= 0 ? filePath.slice(0, lastSlash) : null;

  const body = stripFrontmatter(source).trim();
  if (body.length === 0) {
    return (
      <div className="markdown-preview text-(--color-fg-muted) italic">Empty file</div>
    );
  }
  const Anchor = makeRefAnchor(onOpenRef);
  return (
    <PreviewErrorBoundary>
      <div className="markdown-preview">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkRefs({ home: homeDir, contextDir })]}
          rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
          components={{ a: Anchor }}
        >
          {body}
        </ReactMarkdown>
      </div>
    </PreviewErrorBoundary>
  );
}
```

- [ ] **Step 2: Add `unist-util-visit` if not already present**

Run:

```
pnpm list unist-util-visit
```

If not installed:

```
pnpm add unist-util-visit
```

- [ ] **Step 3: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/Editor/MarkdownPreview.tsx package.json pnpm-lock.yaml
git commit -m "feat(preview): make @-refs and backtick paths clickable in markdown preview"
```

---

## Task 11: End-to-end verification

**Files:** none (manual + script).

- [ ] **Step 1: Run the full pre-commit pipeline**

Run:

```
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --no-deps -- -D warnings
```

Expected: all green.

- [ ] **Step 2: Manual smoke test in dev**

Run: `pnpm tauri dev`

In the running app:

1. Open a Claude Code skill file that contains `@$HOME/...` (e.g. the user's `~/.claude/skills/gsd-add-phase/SKILL.md` if registered, or any other skill containing `@`-refs).
2. **Source view**: hover the ref — tooltip should show the resolved absolute path. Cmd-click (macOS) or Ctrl-click (Linux/Windows) — the editor switches to the target file. The toolbar shows the basename and `markdown` language. The Docs button is hidden.
3. **Preview view**: switch to preview, click the rendered link — same navigation. Tooltip on hover shows the absolute path.
4. **Backtick paths in markdown**: confirm `` `~/foo.md` `` inline becomes a clickable link in preview. Confirm a backtick path inside a fenced code block is **not** clickable.
5. **Edit + save the ad-hoc file**: type something, ⌘S. Confirm the file saves and the first save creates a backup under `appLocalData/backups/<hash>/<timestamp>.bak`.
6. **Broken ref**: open a file containing `@~/nonexistent.md`. Click the link — confirm the editor enters the error state with the path in the message (no crash).
7. **Open a JSON file containing an `@`-ref in a value or comment** (you can hand-edit one for testing). Confirm the source view decorates the ref and cmd-click navigates. Confirm backtick paths are **not** detected (only in markdown).

- [ ] **Step 3: Commit any final cleanup**

If the smoke uncovered small issues, fix them with focused commits.

```bash
# Example
git commit -am "fix(editor): <whatever was wrong>"
```

- [ ] **Step 4: Done**

Move the spec/plan into `done/` if the project follows that convention; otherwise leave them in place.
