import type { Rule } from "../types";
import { findKeyLine, extractYaml } from "./shared";

const TRIGGER_RE = /\b(use\s+when|use\s+this|triggers?\s+when)\b/i;
const ANTIPATTERN_RE = /^(this\s+skill|a\s+skill\s+that)\b/i;

function appliesToSkills(entry: { category: string }) {
  return entry.category === "skills";
}

function parentDirName(filePath: string): string {
  // Skills live at .../skills/<dir>/SKILL.md
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 2] ?? "";
}

export const skillRules: Rule[] = [
  {
    id: "skill/name-mismatch",
    severity: "error",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      const fm = ctx.frontmatter ?? {};
      const name = typeof fm.name === "string" ? fm.name : null;
      if (!name) return [];
      const parent = parentDirName(ctx.filePath);
      if (!parent || name === parent) return [];
      return [
        {
          ruleId: "skill/name-mismatch",
          severity: "error",
          message: `Skill name '${name}' does not match parent directory '${parent}'. Skills are loaded by directory; this will break invocation.`,
          line: findKeyLine(extractYaml(ctx.content), "name", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "skill/description-too-short",
    severity: "warning",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || desc.length >= 40) return [];
      return [
        {
          ruleId: "skill/description-too-short",
          severity: "warning",
          message: `Description is ${desc.length} chars. Anthropic's own skills cluster around 80-200 chars; very short descriptions don't trigger reliably.`,
          line: findKeyLine(extractYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "skill/description-leading-anti-pattern",
    severity: "warning",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || !ANTIPATTERN_RE.test(desc.trim())) return [];
      return [
        {
          ruleId: "skill/description-leading-anti-pattern",
          severity: "warning",
          message: `Description starts with passive framing ('This skill…' / 'A skill that…'). Lead with action ('Use when…').`,
          line: findKeyLine(extractYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "skill/description-missing-trigger",
    severity: "warning",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      const desc = (ctx.frontmatter ?? {}).description;
      if (typeof desc !== "string" || TRIGGER_RE.test(desc)) return [];
      return [
        {
          ruleId: "skill/description-missing-trigger",
          severity: "warning",
          message: `Description has no trigger phrase ('Use when…' / 'Use this…' / 'Triggers when…'). Trigger phrases help the skill activate reliably.`,
          line: findKeyLine(extractYaml(ctx.content), "description", ctx.yamlStartLine),
        },
      ];
    },
  },
  {
    id: "skill/body-empty",
    severity: "warning",
    appliesTo: appliesToSkills,
    run: (ctx) => {
      if (ctx.body.trim().length >= 100) return [];
      return [
        {
          ruleId: "skill/body-empty",
          severity: "warning",
          message: `Skill body is < 100 characters. The body is what Claude actually reads when the skill triggers — make it count.`,
          line: ctx.bodyStartLine,
        },
      ];
    },
  },
];
