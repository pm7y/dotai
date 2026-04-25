import type { CatalogEntry } from "@/catalog";

export type Severity = "error" | "warning";

export type RuleFinding = {
  ruleId: string;
  severity: Severity;
  message: string;
  line: number; // 1-based, into the full file
};

export type ParsedFrontmatter =
  | {
      ok: true;
      frontmatter: Record<string, unknown>;
      body: string;
      yamlStartLine: number; // 1-based line where YAML body starts (after opening `---`)
      bodyStartLine: number; // 1-based line where the body starts (after closing `---`)
    }
  | { ok: false; message: string; line: number };

export type RuleContext = {
  entry: CatalogEntry;
  filePath: string;
  content: string;
  frontmatter: Record<string, unknown> | null; // null when entry has no frontmatterSchemaId or content has none
  body: string;
  yamlStartLine: number; // 1 if no frontmatter
  bodyStartLine: number; // 1 if no frontmatter
};

export type Rule = {
  id: string;
  severity: Severity;
  appliesTo: (entry: CatalogEntry) => boolean;
  run: (ctx: RuleContext) => RuleFinding[];
};
