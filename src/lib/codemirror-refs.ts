import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  hoverTooltip,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { findRefs, type ResolvedRef } from "@/lib/refs";

export type RefsContext = {
  home: string;
  contextDir: string | null;
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

export function refsExtension(ctx: RefsContext) {
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
