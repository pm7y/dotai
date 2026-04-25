# Markdown Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tri-state Edit/Split/Preview view-mode control to the editor for markdown catalog entries, rendering live, sanitized HTML alongside the CodeMirror editor.

**Architecture:** A new `MarkdownPreview` component renders the buffer through `react-markdown` + `remark-gfm` + `rehype-sanitize`. The Editor's body becomes a horizontal flex container; CodeMirror and the preview pane are toggled via `display: none` so the existing `bufferReady`-keyed mount lifecycle is untouched. View mode persists globally to a new `LazyStore("preferences.json")`.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Jotai, CodeMirror 6, `@tauri-apps/plugin-store`. New libs: `react-markdown`, `remark-gfm`, `rehype-sanitize`.

**Spec:** [`docs/superpowers/specs/2026-04-25-markdown-preview-design.md`](../specs/2026-04-25-markdown-preview-design.md)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/markdown.ts` | new | Pure helpers: `stripFrontmatter`, `isAbsoluteUrl`. |
| `src/lib/markdown.test.ts` | new | Vitest tests for the pure helpers. |
| `src/lib/preferences-store.ts` | new | Thin `LazyStore("preferences.json")` wrapper for editor preferences. |
| `src/state/viewMode.ts` | new | Jotai atom for `"edit" \| "split" \| "preview"`. |
| `src/components/Editor/MarkdownPreview.tsx` | new | Renders sanitized markdown, with internal error boundary. |
| `src/components/Editor/ViewModeSelector.tsx` | new | Three-button segmented control. |
| `src/components/Editor/index.tsx` | modify | Header gets the selector; body becomes a flex split; preview mounts conditionally. |
| `src/styles/globals.css` | modify | Add `.markdown-preview` block (~30 lines). |
| `package.json` | modify | New dependencies. |

The pure helpers in `src/lib/markdown.ts` exist so the parts that have logic worth testing are separated from the React component (vitest runs in `node` env — no jsdom — so we cannot test the rendered output).

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install runtime deps**

Run: `pnpm add react-markdown remark-gfm rehype-sanitize`
Expected: three packages added under `dependencies` in `package.json`; lockfile updated.

- [ ] **Step 2: Verify typecheck still passes**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add react-markdown, remark-gfm, rehype-sanitize"
```

---

## Task 2: Pure markdown helpers (TDD)

**Files:**
- Create: `src/lib/markdown.ts`
- Test: `src/lib/markdown.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/markdown.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { isAbsoluteUrl, stripFrontmatter } from "./markdown";

describe("stripFrontmatter", () => {
  test("removes a leading --- block", () => {
    const input = "---\ntitle: Hi\n---\n# Body\n";
    expect(stripFrontmatter(input)).toBe("# Body\n");
  });

  test("handles CRLF line endings", () => {
    const input = "---\r\ntitle: Hi\r\n---\r\nBody\r\n";
    expect(stripFrontmatter(input)).toBe("Body\r\n");
  });

  test("returns the source unchanged when there is no frontmatter", () => {
    const input = "# Just a heading\n";
    expect(stripFrontmatter(input)).toBe(input);
  });

  test("does not strip a --- that is not at the start of the file", () => {
    const input = "intro\n\n---\nname: x\n---\n";
    expect(stripFrontmatter(input)).toBe(input);
  });

  test("handles an empty frontmatter block", () => {
    expect(stripFrontmatter("---\n---\nrest")).toBe("rest");
  });
});

describe("isAbsoluteUrl", () => {
  test("recognises http and https", () => {
    expect(isAbsoluteUrl("http://example.com")).toBe(true);
    expect(isAbsoluteUrl("https://example.com/x")).toBe(true);
  });

  test("recognises mailto", () => {
    expect(isAbsoluteUrl("mailto:foo@bar.com")).toBe(true);
  });

  test("rejects relative paths and anchors", () => {
    expect(isAbsoluteUrl("./foo.md")).toBe(false);
    expect(isAbsoluteUrl("/abs/path")).toBe(false);
    expect(isAbsoluteUrl("#heading")).toBe(false);
    expect(isAbsoluteUrl("foo.md")).toBe(false);
  });

  test("rejects undefined / empty input", () => {
    expect(isAbsoluteUrl(undefined)).toBe(false);
    expect(isAbsoluteUrl("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm test src/lib/markdown.test.ts`
Expected: FAIL — `Cannot find module './markdown'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/markdown.ts`:

```ts
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?/;

export function stripFrontmatter(source: string): string {
  return source.replace(FRONTMATTER_RE, "");
}

const ABSOLUTE_URL_RE = /^(https?:|mailto:)/i;

export function isAbsoluteUrl(href: string | undefined): boolean {
  if (!href) return false;
  return ABSOLUTE_URL_RE.test(href);
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm test src/lib/markdown.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.ts src/lib/markdown.test.ts
git commit -m "feat(editor): add markdown helper utilities"
```

---

## Task 3: Preferences store

**Files:**
- Create: `src/lib/preferences-store.ts`

This mirrors `src/lib/sync-store.ts` (which has no test file — `LazyStore` requires the Tauri runtime, so the wrapper is verified manually in Task 10).

- [ ] **Step 1: Write the wrapper**

Create `src/lib/preferences-store.ts`:

```ts
import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("preferences.json");

export type ViewMode = "edit" | "split" | "preview";

const VIEW_MODE_KEY = "editor.viewMode";
const DEFAULT_VIEW_MODE: ViewMode = "split";

function isViewMode(value: unknown): value is ViewMode {
  return value === "edit" || value === "split" || value === "preview";
}

export async function loadViewMode(): Promise<ViewMode> {
  try {
    const value = await store.get<unknown>(VIEW_MODE_KEY);
    return isViewMode(value) ? value : DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

export async function saveViewMode(mode: ViewMode): Promise<void> {
  await store.set(VIEW_MODE_KEY, mode);
  await store.save();
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/preferences-store.ts
git commit -m "feat(editor): add preferences store for view mode"
```

---

## Task 4: View-mode atom

**Files:**
- Create: `src/state/viewMode.ts`

- [ ] **Step 1: Write the atom**

Create `src/state/viewMode.ts`:

```ts
import { atom } from "jotai";
import type { ViewMode } from "@/lib/preferences-store";

/**
 * Global editor view mode for markdown files.
 *
 * Hydrated from `preferences.json` by the Editor component on mount, and
 * written back via `saveViewMode` when the user changes it.
 */
export const viewModeAtom = atom<ViewMode>("split");
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/state/viewMode.ts
git commit -m "feat(editor): add view-mode atom"
```

---

## Task 5: MarkdownPreview component

**Files:**
- Create: `src/components/Editor/MarkdownPreview.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/Editor/MarkdownPreview.tsx`:

```tsx
import { Component, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { isAbsoluteUrl, stripFrontmatter } from "@/lib/markdown";
import { openDocs } from "@/lib/docs-links";

type Props = { source: string };

type AnchorProps = JSX.IntrinsicElements["a"];

function PreviewAnchor({ href, children, ...rest }: AnchorProps) {
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
}

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

export function MarkdownPreview({ source }: Props) {
  const body = stripFrontmatter(source).trim();
  if (body.length === 0) {
    return (
      <div className="markdown-preview text-(--color-fg-muted) italic">
        Empty file
      </div>
    );
  }
  return (
    <PreviewErrorBoundary>
      <div className="markdown-preview">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{ a: PreviewAnchor }}
        >
          {body}
        </ReactMarkdown>
      </div>
    </PreviewErrorBoundary>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (If `JSX.IntrinsicElements` is not in scope, replace `AnchorProps` with `import type { AnchorHTMLAttributes } from "react"` and `type AnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string };`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/Editor/MarkdownPreview.tsx
git commit -m "feat(editor): add MarkdownPreview component"
```

---

## Task 6: ViewModeSelector component

**Files:**
- Create: `src/components/Editor/ViewModeSelector.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/Editor/ViewModeSelector.tsx`:

```tsx
import type { ViewMode } from "@/lib/preferences-store";

type Props = {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
};

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: "edit", label: "Edit" },
  { mode: "split", label: "Split" },
  { mode: "preview", label: "Preview" },
];

export function ViewModeSelector({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Editor view mode"
      className="flex overflow-hidden rounded border border-(--color-border) text-[11px]"
    >
      {OPTIONS.map(({ mode, label }) => {
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(mode)}
            className={
              active
                ? "bg-(--color-accent) px-2 py-0.5 text-(--color-accent-fg)"
                : "px-2 py-0.5 hover:bg-(--color-bg-muted)"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Editor/ViewModeSelector.tsx
git commit -m "feat(editor): add ViewModeSelector segmented control"
```

---

## Task 7: Wire view mode into the Editor

This task does three things: hydrate the atom from the store on mount, render the selector for markdown entries, and split the body into editor + preview panes.

**Files:**
- Modify: `src/components/Editor/index.tsx`

- [ ] **Step 1: Add imports at the top of the file**

`useAtom`, `useEffect`, and `useCallback` are already imported in the existing file — do not duplicate them. After the existing import block (currently ending with the `EnvVarsPanel` import), append:

```tsx
import { viewModeAtom } from "@/state/viewMode";
import { loadViewMode, saveViewMode, type ViewMode } from "@/lib/preferences-store";
import { MarkdownPreview } from "@/components/Editor/MarkdownPreview";
import { ViewModeSelector } from "@/components/Editor/ViewModeSelector";
```

- [ ] **Step 2: Inside the `Editor` component, add view-mode state and hydration**

After the existing `setConflict` line (`const setConflict = useSetAtom(conflictAtom);`), add:

```tsx
const [viewMode, setViewMode] = useAtom(viewModeAtom);
const isMarkdown = entry?.language === "markdown";

useEffect(() => {
  let cancelled = false;
  void loadViewMode().then((mode) => {
    if (!cancelled) setViewMode(mode);
  });
  return () => {
    cancelled = true;
  };
}, [setViewMode]);

const onViewModeChange = useCallback(
  (next: ViewMode) => {
    setViewMode(next);
    void saveViewMode(next);
  },
  [setViewMode],
);
```

(Place the `isMarkdown` line right after `entry` is computed if the linter complains about ordering — TypeScript narrowing on `entry?.language` requires `entry` to be in scope.)

- [ ] **Step 3: Add the selector to the header**

In the header, immediately before the existing language pill (`<span className="rounded bg-(--color-bg-muted) ...">{entry.language}</span>`), insert:

```tsx
{isMarkdown && (
  <ViewModeSelector value={viewMode} onChange={onViewModeChange} />
)}
```

- [ ] **Step 4: Replace the editor container with a split layout**

Replace the final `<div ref={containerRef} ...>` block (the one with `style={{ display: showEditor ? "block" : "none" }}`) with:

```tsx
<div className="flex flex-1 min-h-0">
  <div
    ref={containerRef}
    className="flex-1 overflow-auto"
    style={{
      display:
        showEditor && (!isMarkdown || viewMode !== "preview")
          ? "block"
          : "none",
      flexBasis: isMarkdown && viewMode === "split" ? "50%" : "100%",
    }}
  />
  {showEditor && isMarkdown && viewMode !== "edit" && (
    <div
      className="overflow-auto border-l border-(--color-border)"
      style={{
        flexBasis: viewMode === "split" ? "50%" : "100%",
      }}
    >
      <MarkdownPreview source={buffer?.currentContent ?? ""} />
    </div>
  )}
</div>
```

- [ ] **Step 5: Typecheck, lint, format**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: no errors. If `pnpm format:check` reports diffs in `Editor/index.tsx`, run `pnpm format` and re-run `format:check`.

- [ ] **Step 6: Commit**

```bash
git add src/components/Editor/index.tsx
git commit -m "feat(editor): wire markdown preview into Editor"
```

---

## Task 8: Preview styles

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Append the `.markdown-preview` block**

At the end of `src/styles/globals.css`, append:

```css
.markdown-preview {
  padding: 1rem 1.25rem;
  color: var(--color-fg);
  font-size: 14px;
  line-height: 1.6;
  max-width: none;
}

.markdown-preview h1,
.markdown-preview h2,
.markdown-preview h3,
.markdown-preview h4 {
  font-weight: 600;
  line-height: 1.25;
  margin: 1.4em 0 0.5em;
}
.markdown-preview h1 { font-size: 1.6rem; }
.markdown-preview h2 { font-size: 1.3rem; }
.markdown-preview h3 { font-size: 1.1rem; }
.markdown-preview h4 { font-size: 1rem; }

.markdown-preview p,
.markdown-preview ul,
.markdown-preview ol {
  margin: 0.6em 0;
}

.markdown-preview ul,
.markdown-preview ol {
  padding-left: 1.4em;
}

.markdown-preview li + li {
  margin-top: 0.2em;
}

.markdown-preview a {
  color: var(--color-accent);
  text-decoration: none;
}
.markdown-preview a:hover {
  text-decoration: underline;
}

.markdown-preview code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--color-bg-muted);
  color: var(--color-fg);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}

.markdown-preview pre {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.75em 1em;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.9em;
  line-height: 1.5;
  margin: 0.8em 0;
}

.markdown-preview pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
}

.markdown-preview blockquote {
  border-left: 3px solid var(--color-accent);
  color: var(--color-fg-muted);
  margin: 0.8em 0;
  padding: 0.1em 0 0.1em 1em;
}

.markdown-preview hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 1.4em 0;
}

.markdown-preview table {
  border-collapse: collapse;
  margin: 0.8em 0;
  width: auto;
}

.markdown-preview th,
.markdown-preview td {
  border: 1px solid var(--color-border);
  padding: 0.4em 0.7em;
  text-align: left;
}

.markdown-preview tbody tr:nth-child(even) td {
  background: var(--color-bg-subtle);
}

.markdown-preview img {
  max-width: 100%;
  height: auto;
}
```

- [ ] **Step 2: Format**

Run: `pnpm format` (Prettier will normalise the CSS file).

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(editor): add markdown-preview styles"
```

---

## Task 9: Manual verification

**Files:** none modified.

This is the only realistic way to confirm the feature works — the codebase has no automated UI tests and vitest runs in `node` env without jsdom.

- [ ] **Step 1: Start the app**

Run: `pnpm tauri dev`
Expected: app launches without console errors.

- [ ] **Step 2: Walk through the manual checklist from the spec**

Verify each item from the spec's *Testing* section:

1. Open a markdown entry (e.g. user CLAUDE.md). View-mode control appears in the header; default is **Split**; both panes visible.
2. Open a non-markdown entry (e.g. user `settings.json`). View-mode control is absent.
3. Type in the editor. Preview updates live as you type.
4. Cycle Edit → Split → Preview → Edit. Editor cursor and scroll are preserved across switches (the CodeMirror instance must not remount).
5. Quit and relaunch the app. Last-used view mode is restored.
6. Click an external link in the preview (e.g. a `https://...` URL inside the file). Opens in the system browser; webview does not navigate.
7. Open a file with YAML frontmatter (any agent `.md`). Frontmatter is **not** rendered in the preview.
8. Add `<script>alert(1)</script>` to a markdown file's body. The script tag is stripped from the rendered output (no alert fires; no `<script>` in the DOM).
9. Open a read-only entry. Preview renders correctly.
10. Open an empty markdown file. Preview shows the "Empty file" placeholder.

- [ ] **Step 3: Run the full verification pipeline**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all pass.

- [ ] **Step 4: Run Rust verification (no Rust changed, but CI runs it)**

Run: `cargo check --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --no-deps -- -D warnings`
Expected: clean.

- [ ] **Step 5: Final review**

Re-read `git log --oneline` for the work — there should be ~8 small commits, each conventional-commit style. No follow-up commit needed unless verification turned up issues.

If any verification step in Step 2 failed, return to the relevant task, write a fix, re-run the verification, and add a `fix(editor): ...` commit before moving on.

---

## Notes for the implementer

- **CLAUDE.md says to run pnpm from the project root**, never `src-tauri/`. If `vite` cannot be found, you ran from the wrong dir.
- **Don't add `@tailwindcss/typography`** — the spec rules it out. Use the hand-written CSS in Task 8.
- **Don't add `rehype-highlight`** — code-block syntax highlighting is explicitly v1 out-of-scope.
- **Don't introduce a debounce** on the preview re-render. The spec says no debounce in v1; only add one if measured performance shows it's needed.
- **Keep the existing `bufferReady`-keyed CodeMirror mount intact.** Toggling view modes must not retrigger that effect, or the editor will lose cursor/scroll on every switch.
- **Frontmatter is hidden, not deleted.** The buffer string sent to the preview still contains it; only the rendered output omits it.
