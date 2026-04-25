import type { Rule, RuleFinding } from "../types";
import { findKeyLine, extractYaml } from "./shared";
import { isKnownTool } from "../tool-names";

const TRIGGER_RE = /\b(use\s+this\s+agent|use\s+when|triggers?\s+when)\b/i;

function appliesToAgents(entry: { category: string }) {
  return entry.category === "agents";
}

function basenameNoExt(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return (parts[parts.length - 1] ?? "").replace(/\.md$/i, "");
}

function toolList(fm: Record<string, unknown>): string[] {
  const t = fm.tools;
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  if (typeof t === "string") {
    return t
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export const agentRules: Rule[] = [
  {
    id: "agent/name-mismatch",
    severity: "error",
    appliesTo: appliesToAgents,
    run: (ctx) => {
      const name = (ctx.frontmatter ?? {}).name;
      if (typeof name !== "string") return [];
      const basename = basenameNoExt(ctx.filePath);
      if (!basename || name === basename) return [];
      return [
        {
          ruleId: "agent/name-mismatch",
          severity: "error",
          message: `Agent name '${name}' does not match filename '${basename}.md'.`,
          line: findKeyLine(extractYaml(ctx.content), "name", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "agent/invalid-tool",
    severity: "error",
    appliesTo: appliesToAgents,
    run: (ctx): RuleFinding[] => {
      const tools = toolList(ctx.frontmatter ?? {});
      const yaml = extractYaml(ctx.content);
      const toolsLine = findKeyLine(yaml, "tools", ctx.yamlStartLine);
      const invalid = tools.filter((t) => !isKnownTool(t));
      return invalid.map((t) => ({
        ruleId: "agent/invalid-tool",
        severity: "error",
        message: `Unknown tool '${t}'. Use a built-in tool name or an 'mcp__server__tool' identifier.`,
        line: toolsLine,
      }));
    },
  },
  {
    id: "agent/description-too-short",
    severity: "warning",
    appliesTo: appliesToAgents,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || desc.length >= 40) return [];
      return [
        {
          ruleId: "agent/description-too-short",
          severity: "warning",
          message: `Description is ${desc.length} chars. Short descriptions trigger less reliably.`,
          line: findKeyLine(extractYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "agent/description-missing-trigger",
    severity: "warning",
    appliesTo: appliesToAgents,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || TRIGGER_RE.test(desc)) return [];
      return [
        {
          ruleId: "agent/description-missing-trigger",
          severity: "warning",
          message: `Description has no trigger phrase ('Use this agent…' / 'Use when…' / 'Triggers when…').`,
          line: findKeyLine(extractYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "agent/model-unset",
    severity: "warning",
    appliesTo: appliesToAgents,
    run: (ctx) => {
      const fm = ctx.frontmatter ?? {};
      if (typeof fm.model === "string" && fm.model.length > 0) return [];
      return [
        {
          ruleId: "agent/model-unset",
          severity: "warning",
          message: `model is not set. Defaults to 'inherit', but explicit model choice meaningfully affects behaviour.`,
          line: ctx.yamlStartLine,
        },
      ];
    },
  },
];
