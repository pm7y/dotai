import type { CatalogEntry } from "@/catalog";
import type { Rule, RuleContext, RuleFinding } from "./types";
import { parseFrontmatter } from "./rules/shared";
import { schemaRule } from "./rules/schema";
import { skillRules } from "./rules/skill";
import { agentRules } from "./rules/agent";
import { commandRules } from "./rules/command";
import { memoryRules } from "./rules/memory";
import { rulesCategoryRules } from "./rules/rules-category";

let REGISTRY: Rule[] = [];

export function runRules(
  entry: CatalogEntry,
  content: string,
  filePath: string,
): RuleFinding[] {
  const parsed = parseFrontmatter(content);
  if (!parsed.ok) {
    return [
      {
        ruleId: "frontmatter/yaml-parse-error",
        severity: "error",
        message: parsed.message,
        line: parsed.line,
      },
    ];
  }
  const ctx: RuleContext = {
    entry,
    filePath,
    content,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    yamlStartLine: parsed.yamlStartLine,
    bodyStartLine: parsed.bodyStartLine,
  };
  const out: RuleFinding[] = [];
  for (const rule of REGISTRY) {
    if (!rule.appliesTo(entry)) continue;
    out.push(...rule.run(ctx));
  }
  return out;
}

export function __setRegistryForTests(rules: Rule[]): () => void {
  const prev = REGISTRY;
  REGISTRY = rules;
  return () => {
    REGISTRY = prev;
  };
}

export function registerRules(rules: Rule[]): void {
  REGISTRY.push(...rules);
}

export type { Rule, RuleFinding, Severity, RuleContext } from "./types";

REGISTRY.push(schemaRule);
REGISTRY.push(...skillRules);
REGISTRY.push(...agentRules);
REGISTRY.push(...commandRules);
REGISTRY.push(...memoryRules, ...rulesCategoryRules);
