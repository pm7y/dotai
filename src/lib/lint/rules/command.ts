import type { Rule, RuleFinding } from "../types";
import { findKeyLine, extractYaml } from "./shared";
import { isKnownTool } from "../tool-names";

function appliesToCommands(entry: { category: string }) {
  return entry.category === "commands";
}

function toolList(fm: Record<string, unknown>): string[] {
  const t = fm["allowed-tools"];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  if (typeof t === "string")
    return t
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

const ARG_RE = /\$(?:\d+|ARGUMENTS)\b/;

export const commandRules: Rule[] = [
  {
    id: "command/missing-description",
    severity: "error",
    appliesTo: appliesToCommands,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc === "string" && desc.length > 0) return [];
      return [
        {
          ruleId: "command/missing-description",
          severity: "error",
          message: `Slash commands need a description. The user-facing tooltip and discoverability depend on it.`,
          line: ctx.yamlStartLine,
        },
      ];
    },
  },
  {
    id: "command/description-too-short",
    severity: "warning",
    appliesTo: appliesToCommands,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || desc.length >= 20) return [];
      return [
        {
          ruleId: "command/description-too-short",
          severity: "warning",
          message: `Description is ${desc.length} chars. Aim for at least 20 to be informative.`,
          line: findKeyLine(extractYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "command/invalid-tool",
    severity: "error",
    appliesTo: appliesToCommands,
    run: (ctx): RuleFinding[] => {
      const yaml = extractYaml(ctx.content);
      const tools = toolList(ctx.frontmatter ?? {});
      const line = findKeyLine(yaml, "allowed-tools", ctx.yamlStartLine);
      return tools
        .filter((t) => !isKnownTool(t))
        .map((t) => ({
          ruleId: "command/invalid-tool",
          severity: "error",
          message: `Unknown tool '${t}' in allowed-tools.`,
          line,
        }));
    },
  },
  {
    id: "command/argument-hint-mismatch",
    severity: "warning",
    appliesTo: appliesToCommands,
    run: (ctx) => {
      const fm = ctx.frontmatter ?? {};
      const hint = typeof fm["argument-hint"] === "string" ? fm["argument-hint"] : "";
      const bodyUsesArgs = ARG_RE.test(ctx.body);
      if (bodyUsesArgs === !!hint) return [];
      const message = bodyUsesArgs
        ? `Body uses $1/$2/$ARGUMENTS but no argument-hint is set. Users won't know what to type.`
        : `argument-hint is set but the body doesn't reference $1/$2/$ARGUMENTS — the input will be ignored.`;
      return [
        {
          ruleId: "command/argument-hint-mismatch",
          severity: "warning",
          message,
          line: ctx.yamlStartLine,
        },
      ];
    },
  },
];
