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

describe("schema rule", () => {
  test("flags missing required name on a skill", () => {
    const entry = entryById("cc.user.skills");
    if (!entry) throw new Error("fixture entry missing");
    const content = "---\ndescription: present\n---\nbody\n";
    const findings = runRules(entry, content, "/u/.claude/skills/foo/SKILL.md");
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("skills/missing-required");
  });

  test("flags unknown property on agent frontmatter", () => {
    const entry = entryById("cc.user.agents");
    if (!entry) throw new Error("fixture entry missing");
    const content = "---\nname: foo\ndescription: bar baz qux\nbogus: x\n---\nbody\n";
    const findings = runRules(entry, content, "/u/.claude/agents/foo.md");
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("agents/schema-violation");
  });

  test("emits no schema findings for valid skill frontmatter", () => {
    const entry = entryById("cc.user.skills");
    if (!entry) throw new Error("fixture entry missing");
    const content = "---\nname: foo\ndescription: a valid skill\n---\nbody\n";
    const findings = runRules(entry, content, "/u/.claude/skills/foo/SKILL.md");
    const schemaFindings = findings.filter(
      (f) => f.ruleId.includes("schema") || f.ruleId.endsWith("missing-required"),
    );
    expect(schemaFindings).toEqual([]);
  });

  test("does not run for entries without frontmatterSchemaId", () => {
    const entry = entryById("cc.user.memory");
    if (!entry) throw new Error("fixture entry missing");
    const findings = runRules(entry, "# memory body\n", "/u/.claude/CLAUDE.md");
    const schemaFindings = findings.filter(
      (f) =>
        f.ruleId.endsWith("schema-violation") || f.ruleId.endsWith("missing-required"),
    );
    expect(schemaFindings).toEqual([]);
  });
});

describe("skill rules", () => {
  const skill = () => entryById("cc.user.skills")!;
  const path = "/u/.claude/skills/foo-bar/SKILL.md";
  const fm = (extra: Record<string, string>) =>
    "---\n" +
    Object.entries({
      name: "foo-bar",
      description: "Use when foo bar baz qux quux corge.",
      ...extra,
    })
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") +
    "\n---\n";
  const body = "## Body\n".padEnd(150, "x");

  test("skill/name-mismatch when name != parent directory", () => {
    const findings = runRules(skill(), fm({ name: "wrong" }) + body, path);
    expect(findings.map((f) => f.ruleId)).toContain("skill/name-mismatch");
  });

  test("no skill/name-mismatch when name == parent directory", () => {
    const findings = runRules(skill(), fm({}) + body, path);
    expect(findings.map((f) => f.ruleId)).not.toContain("skill/name-mismatch");
  });

  test("skill/description-too-short when description < 40 chars", () => {
    const findings = runRules(skill(), fm({ description: "Short." }) + body, path);
    expect(findings.map((f) => f.ruleId)).toContain("skill/description-too-short");
  });

  test("skill/description-leading-anti-pattern flags 'This skill…'", () => {
    const findings = runRules(
      skill(),
      fm({ description: "This skill does the thing for sure now." }) + body,
      path,
    );
    expect(findings.map((f) => f.ruleId)).toContain(
      "skill/description-leading-anti-pattern",
    );
  });

  test("skill/description-missing-trigger flags description without 'use when' / 'use this' / 'triggers when'", () => {
    const findings = runRules(
      skill(),
      fm({
        description:
          "Some description that is long enough but no trigger words at all.",
      }) + body,
      path,
    );
    expect(findings.map((f) => f.ruleId)).toContain(
      "skill/description-missing-trigger",
    );
  });

  test("skill/body-empty when body < 100 chars", () => {
    const findings = runRules(skill(), fm({}) + "tiny\n", path);
    expect(findings.map((f) => f.ruleId)).toContain("skill/body-empty");
  });
});

describe("agent rules", () => {
  const agent = () => entryById("cc.user.agents")!;
  const path = "/u/.claude/agents/my-agent.md";
  const fm = (extra: Record<string, string>) =>
    "---\n" +
    Object.entries({
      name: "my-agent",
      description: "Use this agent when you need to do the thing in question.",
      model: "sonnet",
      ...extra,
    })
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") +
    "\n---\nbody body body\n";

  test("agent/name-mismatch when name != filename basename", () => {
    const findings = runRules(agent(), fm({ name: "other" }), path);
    expect(findings.map((f) => f.ruleId)).toContain("agent/name-mismatch");
  });

  test("agent/invalid-tool flags an unknown tool name", () => {
    const content = fm({}).replace("---\nbody", "tools: [Read, Bogus]\n---\nbody");
    const findings = runRules(agent(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("agent/invalid-tool");
  });

  test("agent/invalid-tool accepts mcp__ prefix", () => {
    const content = fm({}).replace(
      "---\nbody",
      "tools: [mcp__github__list_repos, Read]\n---\nbody",
    );
    const findings = runRules(agent(), content, path);
    expect(findings.map((f) => f.ruleId)).not.toContain("agent/invalid-tool");
  });

  test("agent/description-too-short when < 40 chars", () => {
    const findings = runRules(agent(), fm({ description: "short" }), path);
    expect(findings.map((f) => f.ruleId)).toContain("agent/description-too-short");
  });

  test("agent/description-missing-trigger when no 'use this agent' / 'use when'", () => {
    const findings = runRules(
      agent(),
      fm({
        description: "Performs operations on the data store with all of the things.",
      }),
      path,
    );
    expect(findings.map((f) => f.ruleId)).toContain(
      "agent/description-missing-trigger",
    );
  });

  test("agent/model-unset when model is absent", () => {
    const content =
      "---\nname: my-agent\ndescription: Use this agent for everything important.\n---\nbody body body\n";
    const findings = runRules(agent(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("agent/model-unset");
  });
});

describe("command rules", () => {
  const cmd = () => entryById("cc.user.commands")!;
  const path = "/u/.claude/commands/foo.md";

  test("command/missing-description when description absent", () => {
    const content = "---\n---\nBody using $1\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/missing-description");
  });

  test("command/description-too-short when < 20 chars", () => {
    const content = "---\ndescription: small\n---\nBody $ARGUMENTS\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/description-too-short");
  });

  test("command/invalid-tool against allowed-tools", () => {
    const content =
      "---\ndescription: Run something useful for the team\nallowed-tools: [Read, Bogus]\n---\nbody\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/invalid-tool");
  });

  test("command/argument-hint-mismatch when body uses $1 but no argument-hint", () => {
    const content =
      "---\ndescription: Process the input data thoroughly\n---\nUse $1\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/argument-hint-mismatch");
  });

  test("command/argument-hint-mismatch when argument-hint set but body has no $args", () => {
    const content =
      "---\ndescription: Process the input data thoroughly\nargument-hint: <thing>\n---\nNo args used\n";
    const findings = runRules(cmd(), content, path);
    expect(findings.map((f) => f.ruleId)).toContain("command/argument-hint-mismatch");
  });
});

describe("memory rules", () => {
  const memory = () => entryById("cc.user.memory")!;
  const path = "/u/.claude/CLAUDE.md";

  test("memory/file-too-large when content > 50 KB", () => {
    const big = "x".repeat(51 * 1024);
    const findings = runRules(memory(), big, path);
    expect(findings.map((f) => f.ruleId)).toContain("memory/file-too-large");
  });

  test("memory/no-headings when 200+ lines and no #/##", () => {
    const lines = Array.from({ length: 220 }, () => "plain prose line").join("\n");
    const findings = runRules(memory(), lines, path);
    expect(findings.map((f) => f.ruleId)).toContain("memory/no-headings");
  });

  test("memory/no-headings does not fire on a small file", () => {
    const findings = runRules(memory(), "small file with no headings\n", path);
    expect(findings.map((f) => f.ruleId)).not.toContain("memory/no-headings");
  });
});

describe("rules-category rules", () => {
  const rules = () => entryById("cc.user.rules")!;
  const path = "/u/.claude/rules/some.md";

  test("rules/file-too-large when content > 30 KB", () => {
    const big = "x".repeat(31 * 1024);
    const findings = runRules(rules(), big, path);
    expect(findings.map((f) => f.ruleId)).toContain("rules/file-too-large");
  });
});
