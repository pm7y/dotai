# Inline reference links

**Status:** approved design, awaiting plan
**Date:** 2026-04-26

## Problem

Skill, workflow, and `CLAUDE.md` files routinely cross-reference other files using Claude's `@<path>` syntax — e.g.

```md
**Follow the add-phase workflow** from `@$HOME/.claude/get-shit-done/workflows/add-phase.md`.
```

In the dotai editor those references are inert text. There's no affordance to navigate to the referenced file: the user has to copy the path, expand `$HOME` mentally, and select-or-open the file separately. This breaks the natural flow of reading interlinked skill networks.

## Goals

- Make references in any open file clickable, in both the CodeMirror source view and the markdown preview.
- Resolve clicks to navigate within dotai (with the editor's existing atomic-save / backup behaviour intact), even when the target file is not in the static catalog.
- Keep the catalog as the source of truth for the FileList tree — no content-scanning at index time.

## Non-goals (explicit out-of-scope)

- "Subfiles in the FileList tree" — deferred until inline links are in use and we know what gap they leave.
- Pre-flight existence checks; "where-used" graph; ref-to-ref backlink view.
- Detecting bare path-like strings (no `@` or backticks).
- Detecting paths inside fenced code blocks (only inline backticks count).
- Editing a reference as a structured form. References stay as plain text.

## Reference grammar

Two patterns the parser recognises:

1. **`@`-prefix references** (anywhere in text):
   - `@$HOME/<path>`, `@${HOME}/<path>`, `@~/<path>`
   - `@/<absolute>`, `@./<relative>`, `@../<relative>`
   - Terminator: whitespace, end of line, or end of file.
   - Trailing punctuation `.,;:)` is stripped from the captured path so refs at the end of a sentence resolve cleanly. The stripped chars stay in the rendered text.
2. **Inline backtick paths** (only in files whose `entry.language === "markdown"`):
   - Content inside a single-backtick span starts with `~/`, `/`, `./`, `../`, `$HOME/`, or `${HOME}/`.
   - The whole backtick span is the clickable target.
   - Skip backticks inside fenced code blocks (` ``` … ``` ` or `~~~ … ~~~`).
   - Detected in both source view and preview of markdown files. Not detected in JSON, TOML, or other non-markdown source views (where backticks have no special meaning anyway).

A path is *not* a reference if it contains no path separator (e.g. `@v1` or `` `~` `` alone).

## Path resolution

`resolveRef(rawPath, contextFilePath) → absolutePath`:

- `$HOME` / `${HOME}` / leading `~` → user home directory.
- Leading `/` → absolute, as-is.
- Leading `./` or `../` → resolve against `dirname(contextFilePath)`.
- Final path is normalised (collapse `..`, `.`, redundant slashes).

The user-home value is read once via the existing Tauri `home_dir` plumbing (or equivalent) and cached for the session.

## Architecture

### New modules

| File | Purpose |
|---|---|
| `src/lib/refs.ts` | Pure parser + resolver. `parseRefs(text, contextFilePath, opts)` returns `{ start, end, raw, absolutePath }[]`. `opts.skipBackticks` for source-view non-markdown contexts. |
| `src/lib/codemirror-refs.ts` | CodeMirror `ViewPlugin` that decorates ranges from `parseRefs`, applies a `cm-ref-link` class, and registers a cmd/ctrl-click handler. Tooltip via the standard CM `hoverTooltip` showing the resolved absolute path. |
| `src/lib/ad-hoc.ts` | `entryForPath(absolutePath): CatalogEntry` returns a synthetic entry. `languageFromExtension(ext)` covers the languages already supported (`md`, `json`, `ts`, `tsx`, `js`, `jsx`, `toml`, `yaml`, `yml`, `sh`, plus a `plaintext` fallback). |

### Integration points

- `src/lib/editor-extensions.ts` — `extensionsForEntry(entry)` adds the new CM extension. The extension reads the file path from the editor's facet so it can resolve relative refs.
- `src/components/Editor/MarkdownPreview.tsx` — extend the markdown renderer with a remark/rehype step (or post-process the rendered HTML, whichever fits the existing pipeline) that converts ref ranges into anchor elements with a `data-ref-path` attribute. A delegated click handler on the preview container calls `openRef`.
- `src/state/selection.ts` — extend the selection model:

  ```ts
  type Selection =
    | { entryId: string; filePath: string | null }
    | { entryId: null; filePath: string; syntheticEntry: CatalogEntry };
  ```

  The `Editor` component derives `entry` from whichever side of the union is active.
- `src/lib/refs.ts` exports `openRef(absolutePath, setSelection)` — the single helper both surfaces call. It:
  1. Looks up a catalog entry whose `paths` resolves to `absolutePath` for the current platform/project. If found, sets `selection = { entryId: entry.id, filePath: absolutePath }`.
  2. Otherwise, builds a synthetic entry via `entryForPath(absolutePath)` and sets `selection = { entryId: null, filePath: absolutePath, syntheticEntry }`.

### Synthetic entry shape

```ts
{
  id: `adhoc:${absolutePath}`,
  label: basename(absolutePath),
  kind: "file",
  language: languageFromExtension(extname(absolutePath)),
  schemaId: null,
  frontmatterSchemaId: null,
  docsUrl: null,
  notes: null,
  paths: [absolutePath],
}
```

Synthetic entries are **not read-only**. The user wants to follow refs into a network of files and edit them. Atomic save and the backup-on-first-write contract are path-based (`write_file` writes via tempfile + rename, `shouldBackupNow(filePath)` keys on the path), so they keep working with synthetic entries.

Synthetic entries are not persisted across reloads. They live only in `selection`. Reloading the app restores the last *catalog* selection, not ad-hoc state. (Acceptable per design discussion; revisit if it becomes painful.)

## Click behaviour

- **CodeMirror source view**: cmd/ctrl-click on a decorated range fires `openRef`. Plain click is reserved for text selection — overriding it would break editing. The cursor switches to a pointer when the modifier key is held over a decorated range.
- **Markdown preview**: regular click on the rendered anchor.
- **Keyboard**: not in scope for v1. Refs are reachable by switching to preview view and tab-navigating to the link.

## Visual treatment

- Colour: existing accent (`text-(--color-accent)`).
- Hover: underline.
- Tooltip: resolved absolute path (so the user can sanity-check `$HOME` expansion and `..` collapsing before clicking).
- Source view: dotted underline by default (so the ref is recognisable without holding cmd), solid underline when the modifier key is held.

## Errors and edge cases

- **Target doesn't exist**: no pre-flight check. The existing `readFile` path in `Editor` surfaces the error via `loadState = { status: "error", message }`. Behaviour matches any other unreadable file.
- **Permission denied**: same path as above.
- **Symlinks**: follow them (Tauri's `read_file` already does).
- **Self-reference (file refs itself)**: works — `openRef` is idempotent on the current selection.
- **Refs containing query strings or fragments** (`@./foo.md#section`): the path resolver strips `#…` before resolving and ignores fragments for v1. (Markdown anchors are not navigable in dotai's preview yet.)
- **Refs spanning multiple lines**: not supported. The parser's terminator includes line endings.
- **Escaped tildes** (`\~`): treated as literal text, not a ref. (Edge case, but cheap to handle in the regex.)

## Verification

### Unit tests

`src/lib/refs.test.ts` covering:

- All `@`-prefix variants: `$HOME`, `${HOME}`, `~`, absolute, `./`, `../`.
- Backtick variants, including the contents-must-look-pathlike rule.
- Trailing-punctuation stripping.
- Mid-line, end-of-line, end-of-file termination.
- Multiple refs on one line.
- Refs inside vs. outside fenced code blocks (markdown).
- Escaped tilde.
- Resolver: `$HOME` expansion, relative resolution against context, `..` normalisation.
- Synthetic entry: extension → language map for every supported language plus the `plaintext` fallback.

### Manual

1. Open a skill that uses `@$HOME/...` (e.g. `~/.claude/skills/gsd-add-phase/SKILL.md`).
2. Hover the ref in source view → tooltip shows the resolved path.
3. Cmd-click → editor switches to the workflow file. Toolbar shows the basename and `markdown` language.
4. Switch back to the original via the FileList; switch to preview view; click the rendered link → same navigation.
5. Edit the workflow file; save (⌘S) → confirm backup directory got the original (`appLocalData/backups/<hash>/<timestamp>.bak`).
6. Open a JSON file containing `@~/foo.json` in a comment (or string) → confirm refs work in non-markdown languages.

### Pre-commit pipeline

`/verify` (typecheck, eslint, prettier check, cargo check, clippy with `-D warnings`, cargo fmt check).

## Risk register

- **Backtick false positives in markdown**: small. The "must start with path-prefix" rule keeps most code samples out (e.g. `` `useState` ``, `` `git status` `` are skipped). If we hit problems, tighten further (e.g. require an extension).
- **CodeMirror decoration churn**: `parseRefs` runs on every doc update. The implementation should debounce or use CM's incremental decoration API. Worst case for skill files (a few KB) is negligible, but we'll measure if a large file ever stalls.
- **Selection-model change**: extending `Selection` to a discriminated union touches every reader. Mitigation: use a small helper (`getActiveEntry(selection)`) so call sites don't grow conditionals.

---

## Postscript — 2026-04-26: backtick detection dropped

After the feature shipped we backed out backtick-path detection (commit `1bc274c`). The "small" false-positive risk above turned out to be unreliable in practice — backticks in markdown are overwhelmingly used for code samples, command snippets, and identifier references, not file paths. The path-prefix rule kept obvious cases out (`` `useState` ``, `` `git status` ``) but couldn't distinguish things like a `` `/some/path` `` shown as an example shell argument from a real ref.

What changed:

- `parseRefs` no longer takes options — it always detects only `@`-prefix refs.
- `FindRefsContext` collapsed into `ResolveContext`; `RefsContext` lost `detectBackticks`.
- The `inlineCode` branch in the markdown preview's remark plugin was removed.
- Fence-tracking helpers (`rangesInsideFences`, `isInside`, `FENCE_LINE`, `BACKTICK_REGEX`) are gone.
- Seven backtick-only tests were dropped; one new test asserts that backtick paths are *not* detected.

Net result: `@`-refs only. The "Reference grammar — Inline backtick paths" section above no longer applies. If we want the feature back, the lesson is to require a stronger signal than "starts with `/` and has `/` separators" — e.g. an explicit marker, or only-when-the-file-exists.
