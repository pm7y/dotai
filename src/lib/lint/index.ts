import type { CatalogEntry } from "@/catalog";
import type { Rule, RuleFinding } from "./types";

const REGISTRY: Rule[] = [];

export function runRules(
  entry: CatalogEntry,
  content: string,
  filePath: string,
): RuleFinding[] {
  // Empty registry today; populated by later tasks.
  void entry;
  void content;
  void filePath;
  return [];
}

export type { Rule, RuleFinding, Severity, RuleContext } from "./types";
export { REGISTRY };
