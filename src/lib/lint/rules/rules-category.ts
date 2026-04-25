import type { Rule } from "../types";

function appliesToRulesCategory(entry: { category: string }) {
  return entry.category === "rules";
}

const MAX_BYTES = 30 * 1024;

export const rulesCategoryRules: Rule[] = [
  {
    id: "rules/file-too-large",
    severity: "warning",
    appliesTo: appliesToRulesCategory,
    run: (ctx) => {
      const bytes = new TextEncoder().encode(ctx.content).length;
      if (bytes <= MAX_BYTES) return [];
      return [
        {
          ruleId: "rules/file-too-large",
          severity: "warning",
          message: `Rule file is ${(bytes / 1024).toFixed(1)} KB. Rules are loaded similarly to memory; keep them tight.`,
          line: 1,
        },
      ];
    },
  },
];
