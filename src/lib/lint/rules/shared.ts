import { parse as parseYaml, YAMLParseError } from "yaml";
import type { ParsedFrontmatter } from "../types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)(?:\r?\n)?---\r?\n?/;

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return {
      ok: true,
      frontmatter: {},
      body: content,
      yamlStartLine: 1,
      bodyStartLine: 1,
    };
  }
  const [whole, yamlText] = match;
  const yamlStartLine = 2; // line right after the opening ---
  const bodyStartLine = countLines(whole) + 1;
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText) ?? {};
  } catch (e) {
    const yerr = e as YAMLParseError;
    const linePos = yerr.linePos?.[0]?.line ?? 1;
    return {
      ok: false,
      message: `YAML parse error: ${yerr.message ?? String(e)}`,
      line: yamlStartLine + linePos - 1,
    };
  }
  if (parsed !== null && typeof parsed !== "object") {
    return {
      ok: false,
      message: "YAML frontmatter must be a mapping (key: value pairs).",
      line: yamlStartLine,
    };
  }
  return {
    ok: true,
    frontmatter: (parsed as Record<string, unknown>) ?? {},
    body: content.slice(whole.length),
    yamlStartLine,
    bodyStartLine,
  };
}

function countLines(s: string): number {
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  // If the string ends in \n we counted one too many for "lines that exist before next char"
  if (s.endsWith("\n")) n--;
  return n;
}

export function findKeyLine(
  yamlText: string,
  key: string,
  yamlStartLine: number,
): number {
  // Match only top-level keys (no leading whitespace) so we don't mis-attribute
  // to a key that appears inside a multi-line YAML value (e.g. a folded `description: |` block).
  const lines = yamlText.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^[^\s]/.test(l) && l.startsWith(`${key}:`));
  if (idx === -1) return yamlStartLine;
  return yamlStartLine + idx;
}

export function extractYaml(content: string): string {
  return content.match(FRONTMATTER_RE)?.[1] ?? "";
}

export function parseToolList(fm: Record<string, unknown>, key: string): string[] {
  const t = fm[key];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  if (typeof t === "string") {
    return t
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
