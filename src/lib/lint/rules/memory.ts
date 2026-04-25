import type { Rule } from "../types";

function appliesToMemory(entry: { category: string }) {
  return entry.category === "memory";
}

const MAX_BYTES = 50 * 1024;
const HEADING_RE = /^#{1,6}\s/m;

export const memoryRules: Rule[] = [
  {
    id: "memory/file-too-large",
    severity: "warning",
    appliesTo: appliesToMemory,
    run: (ctx) => {
      const bytes = new TextEncoder().encode(ctx.content).length;
      if (bytes <= MAX_BYTES) return [];
      return [
        {
          ruleId: "memory/file-too-large",
          severity: "warning",
          message: `Memory file is ${(bytes / 1024).toFixed(1)} KB. Memory loads into every conversation; large files burn tokens and dilute attention.`,
          line: 1,
        },
      ];
    },
  },
  {
    id: "memory/no-headings",
    severity: "warning",
    appliesTo: appliesToMemory,
    run: (ctx) => {
      const lineCount = ctx.content.split(/\r?\n/).length;
      if (lineCount < 200) return [];
      if (HEADING_RE.test(ctx.content)) return [];
      return [
        {
          ruleId: "memory/no-headings",
          severity: "warning",
          message: `Memory file has ${lineCount} lines but no headings. Structure helps Claude scan the file quickly.`,
          line: 1,
        },
      ];
    },
  },
];
