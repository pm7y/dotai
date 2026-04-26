import { jsonSchema } from "codemirror-json-schema";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { linter, type Diagnostic } from "@codemirror/lint";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { getSchema, type JsonSchema } from "@/schemas";
import type { CatalogEntry } from "@/catalog";
import type { RuleFinding } from "@/lib/lint";
import { refsExtension, type RefsContext } from "@/lib/codemirror-refs";

function jsonExtension(schema: JsonSchema | undefined): Extension[] {
  if (schema) return jsonSchema(schema as never);
  return [json()];
}

// CodeMirror's defaultHighlightStyle underlines headings (and lang-markdown's
// frontmatter separators inherit similar treatment), which competes visually
// with the lint diagnostic squiggles. We override to bold-only.
const markdownHeadingStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "bold", textDecoration: "none" },
  { tag: tags.heading2, fontWeight: "bold", textDecoration: "none" },
  { tag: tags.heading3, fontWeight: "bold", textDecoration: "none" },
  { tag: tags.heading4, fontWeight: "bold", textDecoration: "none" },
  { tag: tags.heading5, fontWeight: "bold", textDecoration: "none" },
  { tag: tags.heading6, fontWeight: "bold", textDecoration: "none" },
  { tag: tags.contentSeparator, textDecoration: "none" },
]);

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
