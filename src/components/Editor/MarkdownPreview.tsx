import { Component, type AnchorHTMLAttributes, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { isAbsoluteUrl, stripFrontmatter } from "@/lib/markdown";
import { openDocs } from "@/lib/docs-links";

type Props = { source: string; onOpenRef?: (path: string) => void };

type AnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string };

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

export function MarkdownPreview({ source, onOpenRef: _onOpenRef }: Props) {
  const body = stripFrontmatter(source).trim();
  if (body.length === 0) {
    return (
      <div className="markdown-preview text-(--color-fg-muted) italic">Empty file</div>
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
