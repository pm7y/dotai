import { describe, it, expect } from "vitest";
import { entryForPath, languageFromExtension } from "./ad-hoc";

describe("languageFromExtension", () => {
  it("maps .md to markdown", () => {
    expect(languageFromExtension(".md")).toBe("markdown");
  });
  it("maps .markdown to markdown", () => {
    expect(languageFromExtension(".markdown")).toBe("markdown");
  });
  it("maps .json to json", () => {
    expect(languageFromExtension(".json")).toBe("json");
  });
  it("maps .jsonc and .json5 to jsonc", () => {
    expect(languageFromExtension(".jsonc")).toBe("jsonc");
    expect(languageFromExtension(".json5")).toBe("jsonc");
  });
  it("maps .toml to toml", () => {
    expect(languageFromExtension(".toml")).toBe("toml");
  });
  it("falls back to markdown for unknown extensions", () => {
    expect(languageFromExtension(".sh")).toBe("markdown");
    expect(languageFromExtension("")).toBe("markdown");
  });
});

describe("entryForPath", () => {
  it("returns a synthetic entry with the basename as label", () => {
    const e = entryForPath("/Users/alice/.claude/skills/foo/SKILL.md");
    expect(e.id).toBe("adhoc:/Users/alice/.claude/skills/foo/SKILL.md");
    expect(e.label).toBe("SKILL.md");
    expect(e.kind).toBe("file");
    expect(e.language).toBe("markdown");
    expect(e.docsUrl).toBe("");
    expect(e.category).toBe("adhoc");
    expect(e.pathTemplate).toBe("/Users/alice/.claude/skills/foo/SKILL.md");
  });

  it("uses the file extension to pick a language", () => {
    expect(entryForPath("/x/y/foo.json").language).toBe("json");
    expect(entryForPath("/x/y/foo.toml").language).toBe("toml");
  });
});
