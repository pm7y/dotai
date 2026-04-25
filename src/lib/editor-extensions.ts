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
