import { describe, expect, test } from "vitest";
import { runRules, __setRegistryForTests } from "./index";
import { entryById } from "@/catalog";
import { parseFrontmatter } from "./rules/shared";
import type { Rule } from "./index";

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

describe("runRules: aggregation", () => {
  test("emits a single yaml-parse-error finding when YAML is malformed", () => {
    const entry = entryById("cc.user.skills");
    if (!entry) throw new Error("fixture entry missing");
    const content = "---\nname: : bad\n---\nbody\n";
    const findings = runRules(entry, content, "/x/y/z/SKILL.md");
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("frontmatter/yaml-parse-error");
    expect(findings[0].severity).toBe("error");
  });

  test("filters rules by appliesTo and flattens findings", () => {
    const stubRule: Rule = {
      id: "stub/always",
      severity: "warning",
      appliesTo: (e) => e.category === "skills",
      run: () => [
        { ruleId: "stub/always", severity: "warning", message: "hi", line: 1 },
      ],
    };
    const restore = __setRegistryForTests([stubRule]);
    try {
      const skill = entryById("cc.user.skills");
      const memory = entryById("cc.user.memory");
      if (!skill || !memory) throw new Error("fixture entry missing");
      const skillFindings = runRules(skill, "---\nname: a\n---\n", "/x/SKILL.md");
      const memFindings = runRules(memory, "# m\n", "/x/CLAUDE.md");
      expect(skillFindings).toHaveLength(1);
      expect(skillFindings[0].ruleId).toBe("stub/always");
      expect(memFindings).toHaveLength(0);
    } finally {
      restore();
    }
  });
});
