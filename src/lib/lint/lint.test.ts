import { describe, expect, test } from "vitest";
import { runRules } from "./index";
import { entryById } from "@/catalog";
import { parseFrontmatter } from "./rules/shared";

describe("runRules", () => {
  test("returns no findings for an entry with no applicable rules and no schema", () => {
    const entry = entryById("cc.user.memory");
    if (!entry) throw new Error("fixture entry missing");
    const findings = runRules(entry, "# hi\n", "/Users/me/.claude/CLAUDE.md");
    expect(findings).toEqual([]);
  });
});

describe("parseFrontmatter", () => {
  test("parses a leading --- block and returns body + line offsets", () => {
    const input = "---\nname: hi\ndescription: there\n---\n# Body\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({ name: "hi", description: "there" });
    expect(result.body).toBe("# Body\n");
    expect(result.yamlStartLine).toBe(2);
    expect(result.bodyStartLine).toBe(5);
  });

  test("handles CRLF line endings", () => {
    const input = "---\r\nname: hi\r\n---\r\nbody\r\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({ name: "hi" });
    expect(result.body).toBe("body\r\n");
  });

  test("returns ok with empty frontmatter when no --- block exists", () => {
    const input = "# Just markdown\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(input);
    expect(result.yamlStartLine).toBe(1);
    expect(result.bodyStartLine).toBe(1);
  });

  test("returns parse error with line for malformed YAML", () => {
    const input = "---\nname: : bad\n---\nbody\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.line).toBeGreaterThanOrEqual(2);
    expect(result.message).toMatch(/yaml/i);
  });

  test("treats an empty frontmatter block as ok with {}", () => {
    const input = "---\n---\nbody\n";
    const result = parseFrontmatter(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("body\n");
  });
});
