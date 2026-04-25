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
