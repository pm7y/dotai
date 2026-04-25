# Lint Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic lint registry that flags structural errors and best-practice warnings in Claude Code skill, agent, command, memory, and rule files, surfaced inline in CodeMirror and as a status pill in the editor header.

**Architecture:** Pure-function `runRules(entry, content, filePath)` aggregator dispatches to per-category rule files. Findings are exposed via a Jotai derived atom that drives both a CodeMirror linter extension and the editor-header pill. Existing Ajv schema validation is folded in as a generic schema rule. No Rust changes, no new Tauri commands, no persistence.

**Tech Stack:** TypeScript, Vitest, Jotai, CodeMirror 6 (`@codemirror/lint`, `@codemirror/state`, `@codemirror/view`), Ajv, `yaml`, React 19.

**Spec:** `docs/superpowers/specs/2026-04-26-lint-registry-design.md`.

---

## Pre-flight

- Ensure clean working tree: `git status` should show only this plan file (or be clean).
- Run baseline `pnpm test` — should pass before any changes.
- Run baseline `pnpm typecheck` — should pass.

## Files at a glance

**Created:**
- `src/lib/lint/types.ts` — `Severity`, `RuleFinding`, `RuleContext`, `Rule`, `ParsedFrontmatter`
- `src/lib/lint/index.ts` — `runRules(entry, content, filePath)` and the rule registry
- `src/lib/lint/tool-names.ts` — built-in tool allowlist + `mcp__*` matcher
- `src/lib/lint/rules/shared.ts` — `parseFrontmatter`, line-locating helpers
- `src/lib/lint/rules/schema.ts` — generic Ajv-backed rule
- `src/lib/lint/rules/skill.ts` — skill rules (6)
- `src/lib/lint/rules/agent.ts` — agent rules (6)
- `src/lib/lint/rules/command.ts` — command rules (4)
- `src/lib/lint/rules/memory.ts` — memory rules (2)
- `src/lib/lint/rules/rules-category.ts` — rules-category rules (1) — note suffix to avoid clashing with the directory name
- `src/lib/lint/lint.test.ts` — vitest suite, fixtures per rule
- `src/state/lint.ts` — `diagnosticsAtom`
- `src/components/Editor/LintPill.tsx` — editor-header status pill

**Modified:**
- `src/lib/editor-extensions.ts` — replace existing `frontmatterLinter` with new `lintExtension(entry, filePath)` that reads from a CM `StateField`
- `src/components/Editor/index.tsx` — subscribe to `diagnosticsAtom`, dispatch CM `StateEffect` on change, render `<LintPill />` in the header
- `CLAUDE.md` — short note that lint rules live in `src/lib/lint/` (only if needed; skip otherwise)

---

## Task 1: Scaffold types and empty aggregator

**Files:**
- Create: `src/lib/lint/types.ts`
- Create: `src/lib/lint/index.ts`
- Create: `src/lib/lint/lint.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/lint/lint.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { runRules } from "./index";
import { entryById } from "@/catalog";

describe("runRules", () => {
  test("returns no findings for an entry with no applicable rules and no schema", () => {
    const entry = entryById("cc.user.memory");
    if (!entry) throw new Error("fixture entry missing");
    const findings = runRules(entry, "# hi\n", "/Users/me/.claude/CLAUDE.md");
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: FAIL — module `./index` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

`src/lib/lint/types.ts`:
```ts
import type { CatalogEntry } from "@/catalog";

export type Severity = "error" | "warning";

export type RuleFinding = {
  ruleId: string;
  severity: Severity;
  message: string;
  line: number; // 1-based, into the full file
};

export type ParsedFrontmatter =
  | {
      ok: true;
      frontmatter: Record<string, unknown>;
      body: string;
      yamlStartLine: number; // 1-based line where YAML body starts (after opening `---`)
      bodyStartLine: number; // 1-based line where the body starts (after closing `---`)
    }
  | { ok: false; message: string; line: number };

export type RuleContext = {
  entry: CatalogEntry;
  filePath: string;
  content: string;
  frontmatter: Record<string, unknown> | null; // null when entry has no frontmatterSchemaId or content has none
  body: string;
  yamlStartLine: number; // 1 if no frontmatter
  bodyStartLine: number; // 1 if no frontmatter
};

export type Rule = {
  id: string;
  severity: Severity;
  appliesTo: (entry: CatalogEntry) => boolean;
  run: (ctx: RuleContext) => RuleFinding[];
};
```

`src/lib/lint/index.ts`:
```ts
import type { CatalogEntry } from "@/catalog";
import type { Rule, RuleFinding } from "./types";

const REGISTRY: Rule[] = [];

export function runRules(
  entry: CatalogEntry,
  content: string,
  filePath: string,
): RuleFinding[] {
  // Empty registry today; populated by later tasks.
  void entry;
  void content;
  void filePath;
  return [];
}

export type { Rule, RuleFinding, Severity, RuleContext } from "./types";
export { REGISTRY };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lint/types.ts src/lib/lint/index.ts src/lib/lint/lint.test.ts
git commit -m "feat(lint): scaffold lint registry types and empty aggregator"
```

---

## Task 2: Shared frontmatter parser

**Files:**
- Create: `src/lib/lint/rules/shared.ts`
- Modify: `src/lib/lint/lint.test.ts`

The parser is the foundation for nearly every rule, so it gets thorough tests up front.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/lint/lint.test.ts`:
```ts
import { parseFrontmatter } from "./rules/shared";

describe("parseFrontmatter", () => {
  test("parses a leading --- block and returns body + line offsets", () => {
    const input = "---\nname: hi\ndescription: there\n---\n# Body\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({ name: "hi", description: "there" });
    expect(result.body).toBe("# Body\n");
    expect(result.yamlStartLine).toBe(2);
    expect(result.bodyStartLine).toBe(5);
  });

  test("handles CRLF line endings", () => {
    const input = "---\r\nname: hi\r\n---\r\nbody\r\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({ name: "hi" });
    expect(result.body).toBe("body\r\n");
  });

  test("returns ok with empty frontmatter when no --- block exists", () => {
    const input = "# Just markdown\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(input);
    expect(result.yamlStartLine).toBe(1);
    expect(result.bodyStartLine).toBe(1);
  });

  test("returns parse error with line for malformed YAML", () => {
    const input = "---\nname: : bad\n---\nbody\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.line).toBeGreaterThanOrEqual(2);
    expect(result.message).toMatch(/yaml/i);
  });

  test("treats an empty frontmatter block as ok with {}", () => {
    const input = "---\n---\nbody\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("body\n");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: FAIL — `./rules/shared` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

`src/lib/lint/rules/shared.ts`:
```ts
import { parse as parseYaml, YAMLParseError } from "yaml";
import type { ParsedFrontmatter } from "../types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return {
      ok: true,
      frontmatter: {},
      body: content,
      yamlStartLine: 1,
      bodyStartLine: 1,
    };
  }
  const [whole, yamlText] = match;
  const yamlStartLine = 2; // line right after the opening ---
  const bodyStartLine = countLines(whole) + 1;
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText) ?? {};
  } catch (e) {
    const yerr = e as YAMLParseError;
    const linePos = yerr.linePos?.[0]?.line ?? 1;
    return {
      ok: false,
      message: `YAML parse error: ${yerr.message ?? String(e)}`,
      line: yamlStartLine + linePos - 1,
    };
  }
  if (parsed !== null && typeof parsed !== "object") {
    return {
      ok: false,
      message: "YAML frontmatter must be a mapping (key: value pairs).",
      line: yamlStartLine,
    };
  }
  return {
    ok: true,
    frontmatter: (parsed as Record<string, unknown>) ?? {},
    body: content.slice(whole.length),
    yamlStartLine,
    bodyStartLine,
  };
}

function countLines(s: string): number {
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  // If the string ends in \n we counted one too many for "lines that exist before next char"
  if (s.endsWith("\n")) n--;
  return n;
}

export function findKeyLine(
  yamlText: string,
  key: string,
  yamlStartLine: number,
): number {
  const lines = yamlText.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trimStart().startsWith(`${key}:`));
  if (idx === -1) return yamlStartLine;
  return yamlStartLine + idx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lint/rules/shared.ts src/lib/lint/lint.test.ts
git commit -m "feat(lint): add shared frontmatter parser with line tracking"
```

---

## Task 3: Aggregator with rule fan-out

**Files:**
- Modify: `src/lib/lint/index.ts`
- Modify: `src/lib/lint/lint.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/lint/lint.test.ts`:
```ts
import type { Rule } from "./index";
import { __setRegistryForTests } from "./index";

describe("runRules: aggregation", () => {
  test("emits a single yaml-parse-error finding when YAML is malformed", () => {
    const entry = entryById("cc.user.skills");
    if (!entry) throw new Error("fixture entry missing");
    const content = "---\nname: : bad\n---\nbody\n";
    const findings = runRules(entry, content, "/x/y/z/SKILL.md");
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("frontmatter/yaml-parse-error");
    expect(findings[0].severity).toBe("error");
  });

  test("filters rules by appliesTo and flattens findings", () => {
    const stubRule: Rule = {
      id: "stub/always",
      severity: "warning",
      appliesTo: (e) => e.category === "skills",
      run: () => [
        { ruleId: "stub/always", severity: "warning", message: "hi", line: 1 },
      ],
    };
    const restore = __setRegistryForTests([stubRule]);
    try {
      const skill = entryById("cc.user.skills");
      const memory = entryById("cc.user.memory");
      if (!skill || !memory) throw new Error("fixture entry missing");
      const skillFindings = runRules(skill, "---\nname: a\n---\n", "/x/SKILL.md");
      const memFindings = runRules(memory, "# m\n", "/x/CLAUDE.md");
      expect(skillFindings).toHaveLength(1);
      expect(skillFindings[0].ruleId).toBe("stub/always");
      expect(memFindings).toHaveLength(0);
    } finally {
      restore();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: FAIL — `__setRegistryForTests` not exported, aggregator returns `[]`.

- [ ] **Step 3: Write minimal implementation**

Replace `src/lib/lint/index.ts`:
```ts
import type { CatalogEntry } from "@/catalog";
import type { Rule, RuleContext, RuleFinding } from "./types";
import { parseFrontmatter } from "./rules/shared";

let REGISTRY: Rule[] = [];

export function runRules(
  entry: CatalogEntry,
  content: string,
  filePath: string,
): RuleFinding[] {
  const parsed = parseFrontmatter(content);
  if (!parsed.ok) {
    return [
      {
        ruleId: "frontmatter/yaml-parse-error",
        severity: "error",
        message: parsed.message,
        line: parsed.line,
      },
    ];
  }
  const ctx: RuleContext = {
    entry,
    filePath,
    content,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    yamlStartLine: parsed.yamlStartLine,
    bodyStartLine: parsed.bodyStartLine,
  };
  const out: RuleFinding[] = [];
  for (const rule of REGISTRY) {
    if (!rule.appliesTo(entry)) continue;
    out.push(...rule.run(ctx));
  }
  return out;
}

export function __setRegistryForTests(rules: Rule[]): () => void {
  const prev = REGISTRY;
  REGISTRY = rules;
  return () => {
    REGISTRY = prev;
  };
}

export function registerRules(rules: Rule[]): void {
  REGISTRY.push(...rules);
}

export type { Rule, RuleFinding, Severity, RuleContext } from "./types";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lint/index.ts src/lib/lint/lint.test.ts
git commit -m "feat(lint): add rule aggregator with frontmatter parse-error short-circuit"
```

---

## Task 4: Schema (Ajv) rule

**Files:**
- Create: `src/lib/lint/rules/schema.ts`
- Modify: `src/lib/lint/index.ts` (register the rule)
- Modify: `src/lib/lint/lint.test.ts`

This rule replaces the existing Ajv path. It produces `${entry.category}/missing-required` for missing-property errors and `${entry.category}/schema-violation` for everything else. Categories that have no `frontmatterSchemaId` are skipped.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/lint/lint.test.ts`:
```ts
describe("schema rule", () => {
  test("flags missing required name on a skill", () => {
    const entry = entryById("cc.user.skills");
    if (!entry) throw new Error("fixture entry missing");
    const content = "---\ndescription: present\n---\nbody\n";
    const findings = runRules(entry, content, "/u/.claude/skills/foo/SKILL.md");
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("skills/missing-required");
  });

  test("flags unknown property on agent frontmatter", () => {
    const entry = entryById("cc.user.agents");
    if (!entry) throw new Error("fixture entry missing");
    const content =
      "---\nname: foo\ndescription: bar baz qux\nbogus: x\n---\nbody\n";
    const findings = runRules(entry, content, "/u/.claude/agents/foo.md");
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("agents/schema-violation");
  });

  test("emits no schema findings for valid skill frontmatter", () => {
    const entry = entryById("cc.user.skills");
    if (!entry) throw new Error("fixture entry missing");
    const content = "---\nname: foo\ndescription: a valid skill\n---\nbody\n";
    const findings = runRules(entry, content, "/u/.claude/skills/foo/SKILL.md");
    const schemaFindings = findings.filter((f) => f.ruleId.includes("schema") || f.ruleId.endsWith("missing-required"));
    expect(schemaFindings).toEqual([]);
  });

  test("does not run for entries without frontmatterSchemaId", () => {
    const entry = entryById("cc.user.memory");
    if (!entry) throw new Error("fixture entry missing");
    const findings = runRules(entry, "# memory body\n", "/u/.claude/CLAUDE.md");
    const schemaFindings = findings.filter((f) =>
      f.ruleId.endsWith("schema-violation") || f.ruleId.endsWith("missing-required"),
    );
    expect(schemaFindings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: FAIL — schema rule not registered.

- [ ] **Step 3: Write minimal implementation**

`src/lib/lint/rules/schema.ts`:
```ts
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { getSchema } from "@/schemas";
import type { Rule, RuleFinding } from "../types";
import { findKeyLine } from "./shared";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validatorCache = new Map<string, ValidateFunction>();
function getValidator(schemaId: string): ValidateFunction | null {
  let v = validatorCache.get(schemaId);
  if (v) return v;
  const schema = getSchema(schemaId);
  if (!schema) return null;
  v = ajv.compile(schema as object);
  validatorCache.set(schemaId, v);
  return v;
}

export const schemaRule: Rule = {
  id: "schema",
  severity: "error",
  appliesTo: (entry) => !!entry.frontmatterSchemaId,
  run: (ctx) => {
    const schemaId = ctx.entry.frontmatterSchemaId;
    if (!schemaId) return [];
    const validator = getValidator(schemaId);
    if (!validator) return [];
    if (validator(ctx.frontmatter ?? {})) return [];
    const cat = ctx.entry.category;
    const findings: RuleFinding[] = [];
    for (const err of validator.errors ?? []) {
      findings.push(toFinding(cat, ctx, err));
    }
    return findings;
  },
};

function toFinding(
  category: string,
  ctx: { content: string; yamlStartLine: number },
  err: ErrorObject,
): RuleFinding {
  const yamlText = extractYaml(ctx.content);
  const segments = (err.instancePath || "").split("/").filter(Boolean);
  const lastKey = segments[segments.length - 1];
  const line = lastKey
    ? findKeyLine(yamlText, lastKey, ctx.yamlStartLine)
    : ctx.yamlStartLine;
  if (err.keyword === "required") {
    return {
      ruleId: `${category}/missing-required`,
      severity: "error",
      message: `Missing required property: ${(err.params as { missingProperty: string }).missingProperty}`,
      line,
    };
  }
  return {
    ruleId: `${category}/schema-violation`,
    severity: "error",
    message: formatAjvError(err),
    line,
  };
}

function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath || "/";
  switch (err.keyword) {
    case "additionalProperties":
      return `Unknown property: ${(err.params as { additionalProperty: string }).additionalProperty}`;
    case "enum":
      return `${path} must be one of: ${((err.params as { allowedValues: unknown[] }).allowedValues ?? []).join(", ")}`;
    case "type":
      return `${path} must be of type ${(err.params as { type: string }).type}`;
    case "pattern":
      return `${path} does not match pattern ${(err.params as { pattern: string }).pattern}`;
    default:
      return `${path}: ${err.message ?? "validation failed"}`;
  }
}

function extractYaml(content: string): string {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m?.[1] ?? "";
}
```

Modify `src/lib/lint/index.ts` — add registration at module load:
```ts
// at the bottom of the file, after exports:
import { schemaRule } from "./rules/schema";

REGISTRY.push(schemaRule);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: PASS, all tests including the four new schema-rule tests.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lint/rules/schema.ts src/lib/lint/index.ts src/lib/lint/lint.test.ts
git commit -m "feat(lint): add Ajv-backed schema rule with category-prefixed rule ids"
```

---

## Task 5: Wire registry into CodeMirror linter

**Files:**
- Modify: `src/lib/editor-extensions.ts`
- (No test file changes; this is a pure plumbing replacement.)

We replace the existing `frontmatterLinter(schemaId)` with a `lintExtension(entry, filePath)` that calls `runRules` directly. The atom hookup comes in Task 6 — for now the linter still computes findings inline on each tick. This is intentional: it keeps Task 5 small and verifiable. (Task 6 inverts the data flow.)

- [ ] **Step 1: Read the file you're about to modify**

Read: `src/lib/editor-extensions.ts` — current state must be in context before editing.

- [ ] **Step 2: Replace the file**

`src/lib/editor-extensions.ts`:
```ts
import { jsonSchema } from "codemirror-json-schema";
import type { Extension } from "@codemirror/state";
import { linter, type Diagnostic } from "@codemirror/lint";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { getSchema, type JsonSchema } from "@/schemas";
import type { CatalogEntry } from "@/catalog";
import { runRules } from "@/lib/lint";

function jsonExtension(schema: JsonSchema | undefined): Extension[] {
  if (schema) return jsonSchema(schema as never);
  return [json()];
}

function lintExtensionForMarkdown(entry: CatalogEntry, filePath: string): Extension {
  return linter((view) => {
    const text = view.state.doc.toString();
    const findings = runRules(entry, text, filePath);
    return findings.map((f) => {
      const lineNumber = Math.max(1, Math.min(f.line, view.state.doc.lines));
      const lineInfo = view.state.doc.line(lineNumber);
      return {
        from: lineInfo.from,
        to: lineInfo.to,
        severity: f.severity,
        message: f.message,
      } satisfies Diagnostic;
    });
  });
}

export function extensionsForEntry(entry: CatalogEntry, filePath: string): Extension[] {
  switch (entry.language) {
    case "json":
    case "jsonc":
      return jsonExtension(entry.schemaId ? getSchema(entry.schemaId) : undefined);
    case "markdown":
      return [markdown(), lintExtensionForMarkdown(entry, filePath)];
    default:
      return [];
  }
}
```

- [ ] **Step 3: Update the one caller**

Read: `src/components/Editor/index.tsx` — confirm current state.

In `src/components/Editor/index.tsx`, locate the line that calls `extensionsForEntry(entry)` (around line 188 in the existing file). Change it to:
```ts
...extensionsForEntry(entry, filePath ?? ""),
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: PASS, all suites.

- [ ] **Step 6: Smoke test in the app**

Run: `pnpm tauri dev`
- Open a Claude Code skill file with a missing `description` field.
- Confirm the gutter shows a red diagnostic on the relevant line.
- Open a valid agent file. Confirm no diagnostics.
- Quit the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/lib/editor-extensions.ts src/components/Editor/index.tsx
git commit -m "refactor(lint): route CodeMirror diagnostics through the lint registry"
```

---

## Task 6: `diagnosticsAtom` and CodeMirror ↔ Jotai bridge

**Files:**
- Create: `src/state/lint.ts`
- Modify: `src/lib/editor-extensions.ts`
- Modify: `src/components/Editor/index.tsx`

The pill (Task 7) needs the same diagnostics list the editor uses. Inverting the data flow now (atom → CM via `StateField`) avoids running rules twice.

- [ ] **Step 1: Read the existing files**

Read: `src/components/Editor/index.tsx`, `src/lib/editor-extensions.ts` (so the next edits have current context).

- [ ] **Step 2: Write `src/state/lint.ts`**

```ts
import { atom } from "jotai";
import { entryById } from "@/catalog";
import { selectionAtom } from "./selection";
import { buffersAtom } from "./buffers";
import { runRules, type RuleFinding } from "@/lib/lint";

const EMPTY: RuleFinding[] = [];

export const diagnosticsAtom = atom<RuleFinding[]>((get) => {
  const selection = get(selectionAtom);
  if (!selection.entryId || !selection.filePath) return EMPTY;
  const entry = entryById(selection.entryId);
  if (!entry) return EMPTY;
  const buffers = get(buffersAtom);
  const buffer = buffers[selection.filePath];
  if (!buffer) return EMPTY;
  return runRules(entry, buffer.currentContent, selection.filePath);
});
```

- [ ] **Step 3: Replace `src/lib/editor-extensions.ts` with the full new content**

This replaces the entire file. The `runRules` import and the `filePath` parameter from Task 5 are gone — the editor pushes findings into the field via `setLintFindings`.

```ts
import { jsonSchema } from "codemirror-json-schema";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { linter, type Diagnostic } from "@codemirror/lint";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { getSchema, type JsonSchema } from "@/schemas";
import type { CatalogEntry } from "@/catalog";
import type { RuleFinding } from "@/lib/lint";

function jsonExtension(schema: JsonSchema | undefined): Extension[] {
  if (schema) return jsonSchema(schema as never);
  return [json()];
}

export const setLintFindings = StateEffect.define<RuleFinding[]>();

const lintFindingsField = StateField.define<RuleFinding[]>({
  create: () => [],
  update: (value, tr) => {
    for (const e of tr.effects) if (e.is(setLintFindings)) return e.value;
    return value;
  },
});

function lintExtensionForMarkdown(): Extension[] {
  return [
    lintFindingsField,
    linter((view) => {
      const findings = view.state.field(lintFindingsField);
      return findings.map((f) => {
        const lineNumber = Math.max(1, Math.min(f.line, view.state.doc.lines));
        const lineInfo = view.state.doc.line(lineNumber);
        return {
          from: lineInfo.from,
          to: lineInfo.to,
          severity: f.severity,
          message: f.message,
        } satisfies Diagnostic;
      });
    }),
  ];
}

export function extensionsForEntry(entry: CatalogEntry): Extension[] {
  switch (entry.language) {
    case "json":
    case "jsonc":
      return jsonExtension(entry.schemaId ? getSchema(entry.schemaId) : undefined);
    case "markdown":
      return [markdown(), ...lintExtensionForMarkdown()];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Subscribe in `src/components/Editor/index.tsx`**

Add an effect that dispatches `setLintFindings` whenever `diagnosticsAtom` changes:
```ts
import { setLintFindings } from "@/lib/editor-extensions";
import { diagnosticsAtom } from "@/state/lint";
// ...inside Editor()
const findings = useAtomValue(diagnosticsAtom);
useEffect(() => {
  if (!viewRef.current) return;
  viewRef.current.dispatch({ effects: setLintFindings.of(findings) });
}, [findings]);
```

Revert the Task-5 call back to `extensionsForEntry(entry)` (remove the `filePath` argument that was added in Task 5).

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Run tests**

Run: `pnpm test`
Expected: PASS, all suites.

- [ ] **Step 7: Smoke test**

Run: `pnpm tauri dev`
- Open a skill with a missing field. Confirm diagnostic still appears.
- Edit the file to fix the issue. Confirm diagnostic clears live.
- Quit the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/state/lint.ts src/lib/editor-extensions.ts src/components/Editor/index.tsx
git commit -m "refactor(lint): route diagnostics through Jotai atom into CodeMirror StateField"
```

---

## Task 7: Editor-header status pill

**Files:**
- Create: `src/components/Editor/LintPill.tsx`
- Modify: `src/components/Editor/index.tsx`

- [ ] **Step 1: Write `src/components/Editor/LintPill.tsx`**

```tsx
import { useAtomValue } from "jotai";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { diagnosticsAtom } from "@/state/lint";

type Props = {
  onJumpToFirst?: () => void;
};

export function LintPill({ onJumpToFirst }: Props) {
  const findings = useAtomValue(diagnosticsAtom);
  if (findings.length === 0) return null;
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return (
    <button
      type="button"
      onClick={onJumpToFirst}
      className="flex items-center gap-1.5 rounded bg-(--color-bg-muted) px-2 py-0.5 text-[11px] hover:bg-(--color-bg-emphasis)"
      title="Jump to first finding"
    >
      {errors > 0 && (
        <span className="flex items-center gap-1 text-(--color-danger)">
          <AlertCircle size={11} />
          {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="flex items-center gap-1 text-(--color-warn)">
          <AlertTriangle size={11} />
          {warnings}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Wire it into the editor header**

Read: `src/components/Editor/index.tsx`. Add the import and place `<LintPill onJumpToFirst={...} />` in the toolbar, immediately before the language pill (`<span className="rounded bg-(--color-bg-muted)…">{entry.language}</span>`).

The `onJumpToFirst` handler:
```ts
const findings = useAtomValue(diagnosticsAtom); // already added in Task 6
const onJumpToFirst = useCallback(() => {
  if (!viewRef.current || findings.length === 0) return;
  const firstLine = findings[0].line;
  const lineNumber = Math.max(1, Math.min(firstLine, viewRef.current.state.doc.lines));
  const lineInfo = viewRef.current.state.doc.line(lineNumber);
  viewRef.current.dispatch({
    selection: { anchor: lineInfo.from },
    effects: EditorView.scrollIntoView(lineInfo.from, { y: "center" }),
  });
  viewRef.current.focus();
}, [findings]);
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Smoke test**

Run: `pnpm tauri dev`
- Open a skill with one or more errors. Confirm pill renders with the correct counts.
- Click the pill — editor should scroll/focus to the first finding's line.
- Edit to clear all findings. Pill should disappear.
- Quit the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/Editor/LintPill.tsx src/components/Editor/index.tsx
git commit -m "feat(lint): add editor-header status pill that jumps to first finding"
```

---

## Task 8: Skill rules

**Files:**
- Create: `src/lib/lint/rules/skill.ts`
- Modify: `src/lib/lint/index.ts` (register)
- Modify: `src/lib/lint/lint.test.ts`

Six rules:
- E `skill/name-mismatch` — `name` ≠ parent directory name
- W `skill/description-too-short` — < 40 chars
- W `skill/description-leading-anti-pattern` — starts with `This skill…` / `A skill that…`
- W `skill/description-missing-trigger` — no trigger phrase
- W `skill/body-empty` — body < 100 chars

(`skill/missing-required` is already produced by the schema rule from Task 4.)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/lint/lint.test.ts`:
```ts
describe("skill rules", () => {
  const skill = () => entryById("cc.user.skills")!;
  const path = "/u/.claude/skills/foo-bar/SKILL.md";
  const fm = (extra: Record<string, string>) =>
    "---\n" +
    Object.entries({ name: "foo-bar", description: "Use when foo bar baz qux quux corge.", ...extra })
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") +
    "\n---\n";
  const body = "## Body\n".padEnd(150, "x");

  test("skill/name-mismatch when name != parent directory", () => {
    const findings = runRules(skill(), fm({ name: "wrong" }) + body, path);
    expect(findings.map((f) => f.ruleId)).toContain("skill/name-mismatch");
  });

  test("no skill/name-mismatch when name == parent directory", () => {
    const findings = runRules(skill(), fm({}) + body, path);
    expect(findings.map((f) => f.ruleId)).not.toContain("skill/name-mismatch");
  });

  test("skill/description-too-short when description < 40 chars", () => {
    const findings = runRules(skill(), fm({ description: "Short." }) + body, path);
    expect(findings.map((f) => f.ruleId)).toContain("skill/description-too-short");
  });

  test("skill/description-leading-anti-pattern flags 'This skill…'", () => {
    const findings = runRules(
      skill(),
      fm({ description: "This skill does the thing for sure now." }) + body,
      path,
    );
    expect(findings.map((f) => f.ruleId)).toContain("skill/description-leading-anti-pattern");
  });

  test("skill/description-missing-trigger flags description without 'use when' / 'use this' / 'triggers when'", () => {
    const findings = runRules(
      skill(),
      fm({ description: "Some description that is long enough but no trigger words at all." }) + body,
      path,
    );
    expect(findings.map((f) => f.ruleId)).toContain("skill/description-missing-trigger");
  });

  test("skill/body-empty when body < 100 chars", () => {
    const findings = runRules(skill(), fm({}) + "tiny\n", path);
    expect(findings.map((f) => f.ruleId)).toContain("skill/body-empty");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: FAIL — none of the new rule ids exist yet.

- [ ] **Step 3: Write `src/lib/lint/rules/skill.ts`**

```ts
import type { Rule } from "../types";
import { findKeyLine } from "./shared";

const TRIGGER_RE = /\b(use\s+when|use\s+this|triggers?\s+when)\b/i;
const ANTIPATTERN_RE = /^(this\s+skill|a\s+skill\s+that)\b/i;

function appliesToSkills(entry: { category: string }) {
  return entry.category === "skills";
}

function getYaml(content: string): string {
  return content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)?.[1] ?? "";
}

function parentDirName(filePath: string): string {
  // Skills live at .../skills/<dir>/SKILL.md
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 2] ?? "";
}

export const skillRules: Rule[] = [
  {
    id: "skill/name-mismatch",
    severity: "error",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      const fm = ctx.frontmatter ?? {};
      const name = typeof fm.name === "string" ? fm.name : null;
      if (!name) return [];
      const parent = parentDirName(ctx.filePath);
      if (!parent || name === parent) return [];
      return [
        {
          ruleId: "skill/name-mismatch",
          severity: "error",
          message: `Skill name '${name}' does not match parent directory '${parent}'. Skills are loaded by directory; this will break invocation.`,
          line: findKeyLine(getYaml(ctx.content), "name", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "skill/description-too-short",
    severity: "warning",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || desc.length >= 40) return [];
      return [
        {
          ruleId: "skill/description-too-short",
          severity: "warning",
          message: `Description is ${desc.length} chars. Anthropic's own skills cluster around 80-200 chars; very short descriptions don't trigger reliably.`,
          line: findKeyLine(getYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "skill/description-leading-anti-pattern",
    severity: "warning",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || !ANTIPATTERN_RE.test(desc.trim())) return [];
      return [
        {
          ruleId: "skill/description-leading-anti-pattern",
          severity: "warning",
          message: `Description starts with passive framing ('This skill…' / 'A skill that…'). Lead with action ('Use when…').`,
          line: findKeyLine(getYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "skill/description-missing-trigger",
    severity: "warning",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || TRIGGER_RE.test(desc)) return [];
      return [
        {
          ruleId: "skill/description-missing-trigger",
          severity: "warning",
          message: `Description has no trigger phrase ('Use when…' / 'Use this…' / 'Triggers when…'). Trigger phrases help the skill activate reliably.`,
          line: findKeyLine(getYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "skill/body-empty",
    severity: "warning",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      if (ctx.body.trim().length >= 100) return [];
      return [
        {
          ruleId: "skill/body-empty",
          severity: "warning",
          message: `Skill body is < 100 characters. The body is what Claude actually reads when the skill triggers — make it count.`,
          line: ctx.bodyStartLine,
        },
      ];
    },
  },
];
```

- [ ] **Step 4: Register skill rules**

In `src/lib/lint/index.ts`, add at the bottom (after the schema rule registration):
```ts
import { skillRules } from "./rules/skill";
REGISTRY.push(...skillRules);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS, all suites.

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lint/rules/skill.ts src/lib/lint/index.ts src/lib/lint/lint.test.ts
git commit -m "feat(lint): add skill rules (name-mismatch, description quality, body-empty)"
```

---

## Task 9: Agent rules + tool-name allowlist

**Files:**
- Create: `src/lib/lint/tool-names.ts`
- Create: `src/lib/lint/rules/agent.ts`
- Modify: `src/lib/lint/index.ts` (register)
- Modify: `src/lib/lint/lint.test.ts`

Six rules:
- E `agent/invalid-tool` — entry in `tools` not in allowlist and not `mcp__*`
- E `agent/name-mismatch` — `name` ≠ basename without `.md`
- W `agent/description-too-short`
- W `agent/description-missing-trigger`
- W `agent/model-unset`

(`agent/missing-required` comes from the schema rule.)

- [ ] **Step 1: Write `src/lib/lint/tool-names.ts`**

```ts
// Built-in Claude Code agent tools. Maintained manually; refresh from
// https://docs.claude.com/en/docs/claude-code/sub-agents when adding new tools.
// MCP tools match the `mcp__*` pattern instead of being listed here.
export const BUILTIN_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "LS",
  "NotebookEdit",
  "NotebookRead",
  "WebFetch",
  "WebSearch",
  "Task",
  "ExitPlanMode",
  "TodoWrite",
  "AskUserQuestion",
]);

const MCP_PATTERN = /^mcp__[a-zA-Z0-9_-]+(__[a-zA-Z0-9_*-]+)?$/;

export function isKnownTool(name: string): boolean {
  return BUILTIN_TOOLS.has(name) || MCP_PATTERN.test(name);
}
```

- [ ] **Step 2: Write the failing tests**

Append to `src/lib/lint/lint.test.ts`:
```ts
describe("agent rules", () => {
  const agent = () => entryById("cc.user.agents")!;
  const path = "/u/.claude/agents/my-agent.md";
  const fm = (extra: Record<string, string>) =>
    "---\n" +
    Object.entries({
      name: "my-agent",
      description: "Use this agent when you need to do the thing in question.",
      model: "sonnet",
      ...extra,
    })
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") +
    "\n---\nbody body body\n";

  test("agent/name-mismatch when name != filename basename", () => {
    const findings = runRules(agent(), fm({ name: "other" }), path);
    expect(findings.map((f) => f.ruleId)).toContain("agent/name-mismatch");
  });

  test("agent/invalid-tool flags an unknown tool name", () => {
    const content = fm({}).replace("---\nbody", "tools: [Read, Bogus]\n---\nbody");
    const findings = runRules(agent(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("agent/invalid-tool");
  });

  test("agent/invalid-tool accepts mcp__ prefix", () => {
    const content = fm({}).replace(
      "---\nbody",
      "tools: [mcp__github__list_repos, Read]\n---\nbody",
    );
    const findings = runRules(agent(), content, path);
    expect(findings.map((f) => f.ruleId)).not.toContain("agent/invalid-tool");
  });

  test("agent/description-too-short when < 40 chars", () => {
    const findings = runRules(agent(), fm({ description: "short" }), path);
    expect(findings.map((f) => f.ruleId)).toContain("agent/description-too-short");
  });

  test("agent/description-missing-trigger when no 'use this agent' / 'use when'", () => {
    const findings = runRules(
      agent(),
      fm({ description: "Performs operations on the data store with all of the things." }),
      path,
    );
    expect(findings.map((f) => f.ruleId)).toContain("agent/description-missing-trigger");
  });

  test("agent/model-unset when model is absent", () => {
    const content =
      "---\nname: my-agent\ndescription: Use this agent for everything important.\n---\nbody body body\n";
    const findings = runRules(agent(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("agent/model-unset");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: FAIL.

- [ ] **Step 4: Write `src/lib/lint/rules/agent.ts`**

```ts
import type { Rule, RuleFinding } from "../types";
import { findKeyLine } from "./shared";
import { isKnownTool } from "../tool-names";

const TRIGGER_RE = /\b(use\s+this\s+agent|use\s+when|triggers?\s+when)\b/i;

function appliesToAgents(entry: { category: string }) {
  return entry.category === "agents";
}

function getYaml(content: string): string {
  return content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)?.[1] ?? "";
}

function basenameNoExt(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return (parts[parts.length - 1] ?? "").replace(/\.md$/i, "");
}

function toolList(fm: Record<string, unknown>): string[] {
  const t = fm.tools;
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  if (typeof t === "string") {
    return t
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export const agentRules: Rule[] = [
  {
    id: "agent/name-mismatch",
    severity: "error",
    appliesTo: appliesToAgents,
    run: (ctx) => {
      const name = (ctx.frontmatter ?? {}).name;
      if (typeof name !== "string") return [];
      const basename = basenameNoExt(ctx.filePath);
      if (!basename || name === basename) return [];
      return [
        {
          ruleId: "agent/name-mismatch",
          severity: "error",
          message: `Agent name '${name}' does not match filename '${basename}.md'.`,
          line: findKeyLine(getYaml(ctx.content), "name", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "agent/invalid-tool",
    severity: "error",
    appliesTo: appliesToAgents,
    run: (ctx): RuleFinding[] => {
      const tools = toolList(ctx.frontmatter ?? {});
      const yaml = getYaml(ctx.content);
      const toolsLine = findKeyLine(yaml, "tools", ctx.yamlStartLine);
      const invalid = tools.filter((t) => !isKnownTool(t));
      return invalid.map((t) => ({
        ruleId: "agent/invalid-tool",
        severity: "error",
        message: `Unknown tool '${t}'. Use a built-in tool name or an 'mcp__server__tool' identifier.`,
        line: toolsLine,
      }));
    },
  },
  {
    id: "agent/description-too-short",
    severity: "warning",
    appliesTo: appliesToAgents,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || desc.length >= 40) return [];
      return [
        {
          ruleId: "agent/description-too-short",
          severity: "warning",
          message: `Description is ${desc.length} chars. Short descriptions trigger less reliably.`,
          line: findKeyLine(getYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "agent/description-missing-trigger",
    severity: "warning",
    appliesTo: appliesToAgents,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || TRIGGER_RE.test(desc)) return [];
      return [
        {
          ruleId: "agent/description-missing-trigger",
          severity: "warning",
          message: `Description has no trigger phrase ('Use this agent…' / 'Use when…' / 'Triggers when…').`,
          line: findKeyLine(getYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "agent/model-unset",
    severity: "warning",
    appliesTo: appliesToAgents,
    run: (ctx) => {
      const fm = ctx.frontmatter ?? {};
      if (typeof fm.model === "string" && fm.model.length > 0) return [];
      return [
        {
          ruleId: "agent/model-unset",
          severity: "warning",
          message: `model is not set. Defaults to 'inherit', but explicit model choice meaningfully affects behaviour.`,
          line: ctx.yamlStartLine,
        },
      ];
    },
  },
];
```

- [ ] **Step 5: Register agent rules**

In `src/lib/lint/index.ts`, after the skill registration:
```ts
import { agentRules } from "./rules/agent";
REGISTRY.push(...agentRules);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/lint/tool-names.ts src/lib/lint/rules/agent.ts src/lib/lint/index.ts src/lib/lint/lint.test.ts
git commit -m "feat(lint): add agent rules and tool-name allowlist"
```

---

## Task 10: Command rules

**Files:**
- Create: `src/lib/lint/rules/command.ts`
- Modify: `src/lib/lint/index.ts` (register)
- Modify: `src/lib/lint/lint.test.ts`

Four rules:
- E `command/missing-description`
- E `command/invalid-tool` — uses `tool-names.ts` allowlist (key: `allowed-tools`)
- W `command/argument-hint-mismatch` — body uses `$1`/`$2`/`$ARGUMENTS` xor `argument-hint` is set
- W `command/description-too-short` — < 20 chars

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/lint/lint.test.ts`:
```ts
describe("command rules", () => {
  const cmd = () => entryById("cc.user.commands")!;
  const path = "/u/.claude/commands/foo.md";

  test("command/missing-description when description absent", () => {
    const content = "---\n---\nBody using $1\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/missing-description");
  });

  test("command/description-too-short when < 20 chars", () => {
    const content = "---\ndescription: small\n---\nBody $ARGUMENTS\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/description-too-short");
  });

  test("command/invalid-tool against allowed-tools", () => {
    const content =
      "---\ndescription: Run something useful for the team\nallowed-tools: [Read, Bogus]\n---\nbody\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/invalid-tool");
  });

  test("command/argument-hint-mismatch when body uses $1 but no argument-hint", () => {
    const content = "---\ndescription: Process the input data thoroughly\n---\nUse $1\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/argument-hint-mismatch");
  });

  test("command/argument-hint-mismatch when argument-hint set but body has no $args", () => {
    const content =
      "---\ndescription: Process the input data thoroughly\nargument-hint: <thing>\n---\nNo args used\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/argument-hint-mismatch");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/lint/rules/command.ts`**

```ts
import type { Rule, RuleFinding } from "../types";
import { findKeyLine } from "./shared";
import { isKnownTool } from "../tool-names";

function appliesToCommands(entry: { category: string }) {
  return entry.category === "commands";
}

function getYaml(content: string): string {
  return content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)?.[1] ?? "";
}

function toolList(fm: Record<string, unknown>): string[] {
  const t = fm["allowed-tools"];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  if (typeof t === "string") return t.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

const ARG_RE = /\$(?:\d+|ARGUMENTS)\b/;

export const commandRules: Rule[] = [
  {
    id: "command/missing-description",
    severity: "error",
    appliesTo: appliesToCommands,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc === "string" && desc.length > 0) return [];
      return [
        {
          ruleId: "command/missing-description",
          severity: "error",
          message: `Slash commands need a description. The user-facing tooltip and discoverability depend on it.`,
          line: ctx.yamlStartLine,
        },
      ];
    },
  },
  {
    id: "command/description-too-short",
    severity: "warning",
    appliesTo: appliesToCommands,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || desc.length >= 20) return [];
      return [
        {
          ruleId: "command/description-too-short",
          severity: "warning",
          message: `Description is ${desc.length} chars. Aim for at least 20 to be informative.`,
          line: findKeyLine(getYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "command/invalid-tool",
    severity: "error",
    appliesTo: appliesToCommands,
    run: (ctx): RuleFinding[] => {
      const yaml = getYaml(ctx.content);
      const tools = toolList(ctx.frontmatter ?? {});
      const line = findKeyLine(yaml, "allowed-tools", ctx.yamlStartLine);
      return tools
        .filter((t) => !isKnownTool(t))
        .map((t) => ({
          ruleId: "command/invalid-tool",
          severity: "error",
          message: `Unknown tool '${t}' in allowed-tools.`,
          line,
        }));
    },
  },
  {
    id: "command/argument-hint-mismatch",
    severity: "warning",
    appliesTo: appliesToCommands,
    run: (ctx) => {
      const fm = ctx.frontmatter ?? {};
      const hint = typeof fm["argument-hint"] === "string" ? fm["argument-hint"] : "";
      const bodyUsesArgs = ARG_RE.test(ctx.body);
      if (bodyUsesArgs === !!hint) return [];
      const message = bodyUsesArgs
        ? `Body uses $1/$2/$ARGUMENTS but no argument-hint is set. Users won't know what to type.`
        : `argument-hint is set but the body doesn't reference $1/$2/$ARGUMENTS — the input will be ignored.`;
      return [
        {
          ruleId: "command/argument-hint-mismatch",
          severity: "warning",
          message,
          line: ctx.yamlStartLine,
        },
      ];
    },
  },
];
```

- [ ] **Step 4: Register command rules**

In `src/lib/lint/index.ts`:
```ts
import { commandRules } from "./rules/command";
REGISTRY.push(...commandRules);
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS / no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lint/rules/command.ts src/lib/lint/index.ts src/lib/lint/lint.test.ts
git commit -m "feat(lint): add slash-command rules"
```

---

## Task 11: Memory and rules-category rules

**Files:**
- Create: `src/lib/lint/rules/memory.ts`
- Create: `src/lib/lint/rules/rules-category.ts`
- Modify: `src/lib/lint/index.ts` (register)
- Modify: `src/lib/lint/lint.test.ts`

Three rules:
- W `memory/file-too-large` — > 50 KB
- W `memory/no-headings` — ≥ 200 lines, no `#`/`##`
- W `rules/file-too-large` — > 30 KB

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/lint/lint.test.ts`:
```ts
describe("memory rules", () => {
  const memory = () => entryById("cc.user.memory")!;
  const path = "/u/.claude/CLAUDE.md";

  test("memory/file-too-large when content > 50 KB", () => {
    const big = "x".repeat(51 * 1024);
    const findings = runRules(memory(), big, path);
    expect(findings.map((f) => f.ruleId)).toContain("memory/file-too-large");
  });

  test("memory/no-headings when 200+ lines and no #/##", () => {
    const lines = Array.from({ length: 220 }, () => "plain prose line").join("\n");
    const findings = runRules(memory(), lines, path);
    expect(findings.map((f) => f.ruleId)).toContain("memory/no-headings");
  });

  test("memory/no-headings does not fire on a small file", () => {
    const findings = runRules(memory(), "small file with no headings\n", path);
    expect(findings.map((f) => f.ruleId)).not.toContain("memory/no-headings");
  });
});

describe("rules-category rules", () => {
  const rules = () => entryById("cc.user.rules")!;
  const path = "/u/.claude/rules/some.md";

  test("rules/file-too-large when content > 30 KB", () => {
    const big = "x".repeat(31 * 1024);
    const findings = runRules(rules(), big, path);
    expect(findings.map((f) => f.ruleId)).toContain("rules/file-too-large");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/lint/lint.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/lib/lint/rules/memory.ts`**

```ts
import type { Rule } from "../types";

function appliesToMemory(entry: { category: string }) {
  return entry.category === "memory";
}

const MAX_BYTES = 50 * 1024;
const HEADING_RE = /^#{1,6}\s/m;

export const memoryRules: Rule[] = [
  {
    id: "memory/file-too-large",
    severity: "warning",
    appliesTo: appliesToMemory,
    run: (ctx) => {
      const bytes = new TextEncoder().encode(ctx.content).length;
      if (bytes <= MAX_BYTES) return [];
      return [
        {
          ruleId: "memory/file-too-large",
          severity: "warning",
          message: `Memory file is ${(bytes / 1024).toFixed(1)} KB. Memory loads into every conversation; large files burn tokens and dilute attention.`,
          line: 1,
        },
      ];
    },
  },
  {
    id: "memory/no-headings",
    severity: "warning",
    appliesTo: appliesToMemory,
    run: (ctx) => {
      const lineCount = ctx.content.split(/\r?\n/).length;
      if (lineCount < 200) return [];
      if (HEADING_RE.test(ctx.content)) return [];
      return [
        {
          ruleId: "memory/no-headings",
          severity: "warning",
          message: `Memory file has ${lineCount} lines but no headings. Structure helps Claude scan the file quickly.`,
          line: 1,
        },
      ];
    },
  },
];
```

- [ ] **Step 4: Write `src/lib/lint/rules/rules-category.ts`**

```ts
import type { Rule } from "../types";

function appliesToRulesCategory(entry: { category: string }) {
  return entry.category === "rules";
}

const MAX_BYTES = 30 * 1024;

export const rulesCategoryRules: Rule[] = [
  {
    id: "rules/file-too-large",
    severity: "warning",
    appliesTo: appliesToRulesCategory,
    run: (ctx) => {
      const bytes = new TextEncoder().encode(ctx.content).length;
      if (bytes <= MAX_BYTES) return [];
      return [
        {
          ruleId: "rules/file-too-large",
          severity: "warning",
          message: `Rule file is ${(bytes / 1024).toFixed(1)} KB. Rules are loaded similarly to memory; keep them tight.`,
          line: 1,
        },
      ];
    },
  },
];
```

- [ ] **Step 5: Register**

In `src/lib/lint/index.ts`:
```ts
import { memoryRules } from "./rules/memory";
import { rulesCategoryRules } from "./rules/rules-category";
REGISTRY.push(...memoryRules, ...rulesCategoryRules);
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS / no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lint/rules/memory.ts src/lib/lint/rules/rules-category.ts src/lib/lint/index.ts src/lib/lint/lint.test.ts
git commit -m "feat(lint): add memory and rules-category size/structure rules"
```

---

## Task 12: Final pass — formatting, manual smoke, optional CLAUDE.md note

**Files:**
- Possibly modify: `CLAUDE.md`

- [ ] **Step 1: Run the full pre-commit pipeline**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all pass. If `format:check` fails, run `pnpm format` and inspect the diff.

- [ ] **Step 2: Manual end-to-end smoke**

Run: `pnpm tauri dev`
- Open a real skill file. Confirm pill behaviour for both errors and warnings.
- Open an agent file with a deliberately invalid tool name (edit a copy if needed). Confirm `agent/invalid-tool` fires.
- Open a slash command without a description. Confirm `command/missing-description` fires.
- Open the user CLAUDE.md. If it's > 50 KB you should see the `memory/file-too-large` warning; otherwise no warning.
- Quit the dev server.

- [ ] **Step 3: Optional CLAUDE.md update**

If the existing `CLAUDE.md` has an "Adding things" section that documents schema additions, add a one-line bullet:

> **A new lint rule:** add a `Rule` to the appropriate file in `src/lib/lint/rules/` and register it in `src/lib/lint/index.ts`. Add a test in `src/lib/lint/lint.test.ts`. Findings surface inline + in the editor pill automatically.

Skip if it doesn't fit cleanly.

- [ ] **Step 4: Commit (only if Step 3 made changes)**

```bash
git add CLAUDE.md
git commit -m "docs: note where lint rules live"
```

---

## Done

- 20 lint rules across 5 file categories
- Inline CodeMirror diagnostics + editor-header status pill
- Pure-function aggregator with ~40 vitest cases
- Single source of truth (`diagnosticsAtom`) feeding both consumers
- No Rust changes, no new Tauri commands

If a rule turns out to be noisy in practice, it's a one-line `appliesTo: () => false` (or a registry filter) to silence — the structure makes per-rule disable trivial later.
