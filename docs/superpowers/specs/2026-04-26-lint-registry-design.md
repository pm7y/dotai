# Lint Registry — Design

**Status:** Draft
**Date:** 2026-04-26
**Scope:** New deterministic linter for Claude Code authored config files (skills, agents, commands, memory, rules)

## Problem

Users iterate frequently on Claude Code skills, agents, commands, memory files, and rules. dotai already validates JSON-schema shape for some frontmatter, but only at the bare minimum (e.g. `description: minLength: 1`). It does not catch the things that actually break iteration: descriptions that are too short to trigger reliably, agent `tools` entries that aren't real tool names, name/folder mismatches, oversized memory files, etc.

An earlier draft considered an in-app "Review with Claude" launcher (subprocess to `claude -p`, or a clipboard handoff). It was dropped: the subprocess approach is clunky, and the clipboard approach overlaps with what users do anyway in their already-running Claude Code session. dotai's role is to be a clean editor; AI review is what the AI tools themselves are for.

This spec covers static, deterministic linting only.

## Goals

- Catch objectively-broken issues as **errors** (invalid tool names, name/folder mismatches, missing required fields).
- Surface best-practice issues as **warnings** (too-short descriptions, missing trigger phrasing, oversized memory files).
- Cover skills, agents, commands, memory, and rules.
- Reuse the existing CodeMirror inline-diagnostic UX. Add a small status pill to the editor header for an at-a-glance count.
- Keep `runRules()` pure so it is trivial to test.

## Non-goals (v1)

- AI-powered review or any subprocess to `claude` / `copilot` CLIs.
- Per-rule disable from settings UI (rules toggle in code only).
- Auto-fix / quick-fix actions.
- A dedicated "Issues" panel — inline + header pill only.
- Linting Copilot files — Claude Code only.
- Linting hooks (scripts, not authored prose).
- Cross-file checks (e.g. "skill X references command Y that doesn't exist"). Single-file only.

## Architecture

### New module: `src/lib/lint/`

```
src/lib/lint/
  index.ts              # public API: runRules(entry, content) => RuleFinding[]
  types.ts              # Rule, RuleContext, Severity, RuleFinding
  tool-names.ts         # allowlist of valid built-in tool names + mcp__* pattern
  rules/
    skill.ts
    agent.ts
    command.ts
    memory.ts
    rules.ts
    shared.ts           # frontmatter parser + helpers
  lint.test.ts          # vitest, per-rule fixtures
```

### Rule shape

```ts
type Severity = "error" | "warning";

type RuleFinding = {
  ruleId: string;       // e.g. "skill/description-too-short"
  severity: Severity;
  message: string;
  line: number;         // 1-based, into the full file
};

type RuleContext = {
  entry: CatalogEntry;
  content: string;
  frontmatter: Record<string, unknown> | null;  // pre-parsed once
  body: string;                                  // content minus frontmatter block
  yamlStartLine: number;                         // for line attribution
};

type Rule = {
  id: string;
  severity: Severity;
  appliesTo: (entry: CatalogEntry) => boolean;
  run: (ctx: RuleContext) => RuleFinding[];
};
```

The aggregator parses frontmatter once, fans out to applicable rules, returns a flat `RuleFinding[]`.

### Integration with the existing pipeline

The existing Ajv frontmatter validation is folded into the registry as a single generic rule (one rule per `frontmatterSchemaId` it sees). After this change there is one source of truth for "what gets flagged on this file".

- A new `linter()` extension wraps the registry output and emits CodeMirror `Diagnostic`s.
- A new Jotai atom `diagnosticsAtom` derives from `(buffer.currentContent, entry)` and produces the same findings — the editor header pill subscribes to that atom for its count.

## Rule catalogue

20 rules total, 8 errors, 12 warnings.

### Skills (`*/SKILL.md`)

- **E** `skill/name-mismatch` — `name` frontmatter doesn't match the parent directory name. Skills are loaded by directory; mismatch breaks invocation.
- **E** `skill/missing-required` — `name` or `description` missing. Ajv-backed; surfaced through the registry for unified UX.
- **W** `skill/description-too-short` — description < 40 chars. Anthropic's own skills cluster around 80–200; very short descriptions don't trigger reliably.
- **W** `skill/description-leading-anti-pattern` — starts with `This skill…` / `A skill that…`. Passive framing; should lead with action.
- **W** `skill/description-missing-trigger` — doesn't contain a `Use when…` / `Use this…` / `Triggers when…` style phrase.
- **W** `skill/body-empty` — body (post-frontmatter) is empty or < 100 chars.

### Agents (`*.md` under `agents/`)

- **E** `agent/invalid-tool` — entry in `tools` isn't a known tool name and doesn't match `mcp__*`. Allowlist from `tool-names.ts`.
- **E** `agent/name-mismatch` — `name` doesn't match the file's basename (without `.md`).
- **E** `agent/missing-required` — name/description missing (Ajv-backed).
- **W** `agent/description-too-short` — < 40 chars.
- **W** `agent/description-missing-trigger` — no `Use this agent…` / `Use when…` phrasing.
- **W** `agent/model-unset` — `model` field is absent. Valid (defaults to `inherit`) but worth flagging since model choice meaningfully affects behaviour.

### Commands (`*.md` under `commands/`)

- **E** `command/missing-description` — currently allowed by schema; effectively required for discoverability.
- **E** `command/invalid-tool` — same allowlist as agents.
- **W** `command/argument-hint-mismatch` — body uses `$1`/`$2`/`$ARGUMENTS` but `argument-hint` is empty, or vice versa.
- **W** `command/description-too-short` — < 20 chars.

### Memory (`CLAUDE.md`, `CLAUDE.local.md`)

- **W** `memory/file-too-large` — > 50 KB. Loaded into every conversation; large files burn tokens and dilute attention.
- **W** `memory/no-headings` — no `#`/`##` structure in a non-trivial file (≥ 200 lines, no headings).

### Rules (`*.md` under `rules/`)

- **W** `rules/file-too-large` — > 30 KB.

### Cross-category

- **E** `frontmatter/yaml-parse-error` — YAML doesn't parse. Already in existing linter; surfaced through the registry for consistency.

## Data flow & wiring

### Source of truth: a derived atom

```ts
// src/state/lint.ts
export const diagnosticsAtom = atom((get) => {
  const selection = get(selectionAtom);
  const buffers = get(buffersAtom);
  const entry = selection.entryId ? entryById(selection.entryId) : null;
  const filePath = selection.filePath;
  const buffer = filePath ? buffers[filePath] : null;
  if (!entry || !buffer) return EMPTY;
  return runRules(entry, buffer.currentContent);
});
```

`runRules()` is pure — same input always produces same output, no I/O. Sub-millisecond on realistic files; safe to recompute on every keystroke.

### Two consumers

1. **CodeMirror linter extension** — replaces the existing `frontmatterLinter` in `src/lib/editor-extensions.ts`. Reads from a CM facet that the editor populates from the atom; converts `RuleFinding[]` → CM `Diagnostic[]`.
2. **Editor header pill** — small component in `src/components/Editor/index.tsx` that subscribes to `diagnosticsAtom`. Renders nothing if zero findings, otherwise a chip like `2 errors · 1 warning` with severity-coloured backgrounds. Click scrolls the editor to the first finding via `EditorView.scrollIntoView`.

### CM ↔ React bridge

CM doesn't natively read Jotai atoms. Adapter pattern: an effect subscribes to the atom and dispatches a CM `StateEffect` carrying the new diagnostics; a CM `StateField` holds them; a `linter()` extension reads from the field and emits `Diagnostic[]`. CM stays the source of truth for *display*; the atom is the source of truth for *findings*. Both end up rendering the same data.

### No persistence, no Rust changes

All TS, all in-memory. No new Tauri commands, no migrations, nothing in `src-tauri/`.

## Testing

`runRules` is pure — that's the whole point of the architecture. Tests live in `src/lib/lint/lint.test.ts` (vitest, matches the existing `markdown.test.ts` pattern). Per-rule fixtures: input string + entry → expected `RuleFinding[]`. No DOM, no Tauri, no on-disk fixtures.

Target: one passing case + one or two failing cases per rule (~40 small tests). CodeMirror integration and the pill are covered by a manual smoke check in `pnpm tauri dev`. Not worth a Playwright harness for v1.

## Build sequence

Each step is a coherent commit; the app stays working at each step.

1. Scaffold `src/lib/lint/` (types, empty registry, `runRules` returning `[]`) + test file.
2. Migrate the existing Ajv frontmatter validation into the registry as a generic rule.
3. Add `diagnosticsAtom` and rewire the CodeMirror linter to read from it. No behaviour change — same output, new plumbing.
4. Add the editor-header status pill.
5. Add skill rules (~6 rules). Highest leverage; ship first.
6. Add agent rules (~6 rules).
7. Add command rules (~4 rules).
8. Add memory + rules-category rules (~3 rules).
9. Final pass: tool allowlist source-of-truth comment, CLAUDE.md / README touch-ups if needed.

## Risks

- **CM `StateField` ↔ Jotai adapter is the only non-trivial wiring.** If it gets messy, fallback is to compute findings inline in the CM linter and have the pill recompute from the atom (some duplicated work, still cheap).
- **Tool-name allowlist will drift from reality.** We'll need to update it occasionally; `tool-names.ts` carries a comment pointing at the Claude Code docs section that lists tool names.
- **The "missing trigger phrasing" warnings are the most opinionated.** They will sometimes flag perfectly-functional descriptions. Accepted for v1; can become per-rule disable later if it proves noisy.
