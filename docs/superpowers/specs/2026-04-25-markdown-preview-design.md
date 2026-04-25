# Markdown preview

**Status**: Approved
**Date**: 2026-04-25

## Goal

Render a live HTML preview of any markdown file the catalog exposes (CLAUDE.md, AGENTS.md, agent/command/skill/rule files), so users can read formatted output without leaving the editor. Editing remains the primary mode; preview is additive.

## Scope

In: every catalog entry with `language: "markdown"`. As of today that covers roughly 25 entries plus all `dir-of-files` glob expansions (agents, commands, skills, plugins, memory).

Out (v1, see *Non-goals*): syntax highlighting in code blocks, scroll sync, drag-resizable split, KaTeX, Mermaid.

## User-facing behaviour

### View-mode control

A segmented control with three options — **Edit · Split · Preview** — in the editor header, immediately to the left of the language pill. The control is rendered only when the active entry's language is `markdown`; for non-markdown files it is absent (not greyed out).

- **Edit**: editor at 100% width. Identical to today's behaviour.
- **Split**: editor 50% / preview 50%, separated by a 1px divider using `--color-border`. No drag-resize.
- **Preview**: preview at 100% width. The editor DOM stays mounted but is hidden via `display: none` — same pattern already used for the loading state.

### Default mode

For markdown files the default is **Split**. The chosen mode is global (applies to all markdown files), persists across app restarts, and is independent of which entry is selected.

### Live updates

The preview re-renders synchronously on every keystroke from the editor buffer (`buffer.currentContent`). No debounce in v1; `react-markdown` handles the file sizes the catalog exposes (typically < 50 KB, realistic max < 200 KB).

### Frontmatter

YAML frontmatter (matched by the existing `FRONTMATTER_RE` in `src/lib/editor-extensions.ts`) is stripped from the rendered preview. Frontmatter is metadata, not content; rendering it as a fenced code block adds noise.

### Links

- External links (`http://`, `https://`, `mailto:`) open in the system browser via the existing `openDocs`/`@tauri-apps/plugin-opener` path. They never navigate the webview.
- In-page anchors (`#heading`) scroll within the preview pane only.
- Relative links (`./foo.md`) render as plain anchors; clicking them is a no-op for v1 (we don't have an in-app navigator for arbitrary paths).

## Architecture

### New files

| File | Purpose |
|---|---|
| `src/components/Editor/MarkdownPreview.tsx` | React component that renders sanitized markdown. Receives the buffer string as a prop. |
| `src/state/viewMode.ts` | Jotai atom holding `"edit" \| "split" \| "preview"`. |
| `src/lib/preferences-store.ts` | `LazyStore("preferences.json")` wrapper for editor preferences. See *Persistence*. |

### Modified files

| File | Change |
|---|---|
| `src/components/Editor/index.tsx` | Add the segmented control to the header (markdown entries only). Wrap the body in a horizontal flex container; mount `MarkdownPreview` conditionally based on view mode. |
| `src/styles/globals.css` | Add a `.markdown-preview` block (~30 lines) using existing theme tokens. No `@tailwindcss/typography`. |
| `package.json` | New deps: `react-markdown`, `remark-gfm`, `rehype-sanitize`. |

### Component interface

```ts
type MarkdownPreviewProps = {
  source: string;     // raw file contents, frontmatter included
};
```

The component itself is responsible for stripping frontmatter and applying remark/rehype plugins. The Editor passes the buffer through verbatim.

### Markdown pipeline

`react-markdown` configured with:
- `remarkPlugins: [remarkGfm]` — tables, task lists, autolinks, strikethrough.
- `rehypePlugins: [rehypeSanitize]` — default schema (Markdown-compatible, XSS-safe).
- `components.a` — overridden to call the opener plugin on click for absolute URLs; in-page anchors fall through to default behaviour.

### State / data flow

```
buffersAtom[filePath].currentContent
        │
        ▼
Editor (existing)  ──►  CodeMirror  (display: block when mode != "preview")
        │
        ▼
MarkdownPreview     ──►  rendered HTML  (display: block when mode != "edit")
```

The view-mode atom does not affect the CodeMirror mount lifecycle. The existing `bufferReady`-keyed mount effect is unchanged, so switching modes never tears down the editor, loses cursor, or loses scroll position.

### Persistence

The existing codebase uses one `LazyStore` per concern (`sync.json`, `projects.json` in `src/lib/`). Following that pattern, add `src/lib/preferences-store.ts` backed by `LazyStore("preferences.json")` and read/write a single key `"editor.viewMode"`. Initial value defaults to `"split"` if the key is absent. The atom hydrates asynchronously on first read; until hydration completes, callers see the default.

## Styling

A scoped block in `globals.css` keyed on `.markdown-preview`, using existing tokens:

- Headings: `--color-fg`, scaled by level. `h1` 1.6rem, `h2` 1.3rem, `h3` 1.1rem; tighter line-height than body.
- Body: `--color-fg`, 1.5 line-height.
- `code` (inline): `--color-bg-muted` background, `--color-fg-muted` text, monospace.
- `pre`: `--color-bg-subtle` background, `--color-border` 1px, monospace, `overflow-x: auto`.
- `blockquote`: 3px left border in `--color-accent`, `--color-fg-muted` text.
- `table`: 1px borders in `--color-border`, alternating-row tint via `--color-bg-subtle`.
- `a`: `--color-accent`, underline on hover.
- `hr`: `--color-border`.

The pane itself: `padding: 1rem 1.25rem; overflow: auto; max-width: none;`.

## Error handling

- **Sanitization failures**: `rehype-sanitize` strips disallowed nodes silently — that is the desired behaviour.
- **Render exceptions**: wrap `MarkdownPreview` in a tiny error boundary that displays "Failed to render preview" with the error message. Toggling back to Edit always works because the boundary doesn't affect the editor pane.
- **Empty buffer**: render a faint placeholder ("Empty file") instead of an empty pane, to confirm the preview is alive.

## Performance

`react-markdown` re-renders on every keystroke. For files in the realistic size range (< 200 KB) this is sub-millisecond on modern hardware. If profiling later shows hitches on very large files, the fallback is a 100ms debounce on `buffer.currentContent` *before* it reaches `MarkdownPreview`. Not implementing the debounce in v1 (YAGNI; will add only if measured).

## Testing

Manual verification (Tauri app, no automated UI suite today):

1. Open a markdown entry (e.g. user CLAUDE.md). Confirm view-mode control appears, default is Split, both panes are visible.
2. Open a non-markdown entry (e.g. `settings.json`). Confirm view-mode control is absent.
3. Type in the editor. Confirm preview updates live.
4. Switch Edit → Split → Preview → Edit. Confirm cursor position and scroll in the editor pane survive each switch.
5. Restart the app. Confirm last-used view mode is restored.
6. Click an external link in the preview. Confirm it opens in the system browser, not the webview.
7. Open a file with frontmatter (an agent .md). Confirm frontmatter is *not* rendered.
8. Open a file containing `<script>alert(1)</script>` in markdown. Confirm the script tag is stripped (sanitization works).
9. Open a read-only entry. Confirm preview still renders.
10. Run `pnpm typecheck && pnpm lint && pnpm format:check`. All clean.

## Non-goals (v1)

These are intentionally deferred:

- **Syntax highlighting** in code blocks. Plain `<pre><code>` only. Adding `rehype-highlight` later is a single-line plugin addition.
- **Scroll sync** between editor and preview panes.
- **Drag-resizable split** divider. 50/50 fixed.
- **KaTeX / math rendering**.
- **Mermaid diagrams**.
- **Per-entry view-mode memory**. The mode is global.
- **In-app navigation for relative links**. They render as no-op anchors.

## Open questions

None at design time. All decisions are committed above.
