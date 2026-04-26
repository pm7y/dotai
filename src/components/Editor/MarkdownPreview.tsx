import { Component, type AnchorHTMLAttributes, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useAtomValue } from "jotai";
import { visit } from "unist-util-visit";
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
}): () => (tree: Root) => void {
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
