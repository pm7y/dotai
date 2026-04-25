import { jsonSchema } from "codemirror-json-schema";
import type { Extension } from "@codemirror/state";
import { linter, type Diagnostic } from "@codemirror/lint";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { parse as parseYaml, YAMLParseError } from "yaml";
import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { getSchema, type JsonSchema } from "@/schemas";
import type { CatalogEntry } from "@/catalog";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();
function getValidator(schemaId: string) {
  let v = validatorCache.get(schemaId);
  if (v) return v;
  const schema = getSchema(schemaId);
  if (!schema) return null;
  v = ajv.compile(schema as object);
  validatorCache.set(schemaId, v);
  return v;
}

function jsonExtension(schema: JsonSchema | undefined): Extension[] {
  if (schema) return jsonSchema(schema as never);
  return [json()];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function frontmatterLinter(schemaId: string) {
  return linter((view) => {
    const text = view.state.doc.toString();
    const match = text.match(FRONTMATTER_RE);
    if (!match) {
      return [
        {
          from: 0,
          to: Math.min(text.length, 1),
          severity: "warning",
          message: "Missing YAML frontmatter (--- block).",
        } satisfies Diagnostic,
      ];
    }
    const yamlText = match[1];
    const yamlStartLine = 2;
    let parsed: unknown;
    try {
      parsed = parseYaml(yamlText);
    } catch (e) {
      const yerr = e as YAMLParseError;
      const linePos = yerr.linePos?.[0];
      const lineNumber = yamlStartLine + (linePos?.line ?? 1) - 1;
      const lineInfo = view.state.doc.line(Math.min(lineNumber, view.state.doc.lines));
      return [
        {
          from: lineInfo.from,
          to: lineInfo.to,
          severity: "error",
          message: `YAML parse error: ${yerr.message ?? String(e)}`,
        } satisfies Diagnostic,
      ];
    }
    const validator = getValidator(schemaId);
    if (!validator) return [];
    if (validator(parsed)) return [];
    return (validator.errors ?? []).map((err) => {
      const lineNumber = locateErrorLine(yamlText, err, yamlStartLine);
      const lineInfo = view.state.doc.line(Math.min(lineNumber, view.state.doc.lines));
      return {
        from: lineInfo.from,
        to: lineInfo.to,
        severity: "error",
        message: formatAjvError(err),
      } satisfies Diagnostic;
    });
  });
}

function locateErrorLine(yamlText: string, err: ErrorObject, baseLine: number): number {
  if (!err.instancePath) return baseLine;
  const segments = err.instancePath.split("/").filter(Boolean);
  if (segments.length === 0) return baseLine;
  const key = segments[segments.length - 1];
  const lines = yamlText.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trimStart().startsWith(`${key}:`));
  if (idx === -1) return baseLine;
  return baseLine + idx;
}

function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath || "/";
  switch (err.keyword) {
    case "required":
      return `Missing required property: ${(err.params as { missingProperty: string }).missingProperty}`;
    case "additionalProperties":
      return `Unknown property: ${(err.params as { additionalProperty: string }).additionalProperty}`;
    case "enum":
      return `${path} must be one of: ${((err.params as { allowedValues: unknown[] }).allowedValues ?? []).join(", ")}`;
    case "type":
      return `${path} must be of type ${(err.params as { type: string }).type}`;
    case "pattern":
      return `${path} does not match pattern ${(err.params as { pattern: string }).pattern}`;
    default:
      return `${path}: ${err.message ?? "validation failed"}`;
  }
}

export function extensionsForEntry(entry: CatalogEntry): Extension[] {
  switch (entry.language) {
    case "json":
    case "jsonc":
      return jsonExtension(entry.schemaId ? getSchema(entry.schemaId) : undefined);
    case "markdown": {
      const exts: Extension[] = [markdown()];
      if (entry.frontmatterSchemaId) {
        exts.push(frontmatterLinter(entry.frontmatterSchemaId));
      }
      return exts;
    }
    default:
      return [];
  }
}
