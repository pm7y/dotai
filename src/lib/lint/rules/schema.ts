import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { getSchema } from "@/schemas";
import type { Rule, RuleFinding } from "../types";
import { findKeyLine, extractYaml } from "./shared";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validatorCache = new Map<string, ValidateFunction>();
function getValidator(schemaId: string): ValidateFunction | null {
  let v = validatorCache.get(schemaId);
  if (v) return v;
  const schema = getSchema(schemaId);
  if (!schema) return null;
  v = ajv.compile(schema as object);
  validatorCache.set(schemaId, v);
  return v;
}

export const schemaRule: Rule = {
  id: "schema",
  severity: "error",
  appliesTo: (entry) => !!entry.frontmatterSchemaId,
  run: (ctx) => {
    const schemaId = ctx.entry.frontmatterSchemaId;
    if (!schemaId) return [];
    const validator = getValidator(schemaId);
    if (!validator) return [];
    if (validator(ctx.frontmatter ?? {})) return [];
    const cat = ctx.entry.category;
    const findings: RuleFinding[] = [];
    for (const err of validator.errors ?? []) {
      findings.push(toFinding(cat, ctx, err));
    }
    return findings;
  },
};

function toFinding(
  category: string,
  ctx: { content: string; yamlStartLine: number },
  err: ErrorObject,
): RuleFinding {
  const yamlText = extractYaml(ctx.content);
  const segments = (err.instancePath || "").split("/").filter(Boolean);
  const lastKey = segments[segments.length - 1];
  const line = lastKey
    ? findKeyLine(yamlText, lastKey, ctx.yamlStartLine)
    : ctx.yamlStartLine;
  if (err.keyword === "required") {
    return {
      ruleId: `${category}/missing-required`,
      severity: "error",
      message: `Missing required property: ${(err.params as { missingProperty: string }).missingProperty}`,
      line,
    };
  }
  return {
    ruleId: `${category}/schema-violation`,
    severity: "error",
    message: formatAjvError(err),
    line,
  };
}

function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath || "/";
  switch (err.keyword) {
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
