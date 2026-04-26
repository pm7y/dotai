import { describe, it, expect } from "vitest";
import { parseRefs } from "./refs";

describe("parseRefs — @-prefix references", () => {
  it("detects @$HOME/...", () => {
    const text = "see @$HOME/.claude/foo.md for details";
    expect(parseRefs(text, { detectBackticks: false })).toEqual([
      { start: 4, end: 25, raw: "@$HOME/.claude/foo.md" },
    ]);
  });

  it("detects @${HOME}/...", () => {
    const text = "see @${HOME}/.claude/foo.md for details";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs).toHaveLength(1);
    expect(refs[0].raw).toBe("@${HOME}/.claude/foo.md");
  });

  it("detects @~/...", () => {
    const text = "see @~/.claude/foo.md.";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs).toHaveLength(1);
    // Trailing period is stripped from the captured ref.
    expect(refs[0].raw).toBe("@~/.claude/foo.md");
    expect(refs[0].start).toBe(4);
    expect(refs[0].end).toBe(21);
  });

  it("detects absolute @/foo/bar.md", () => {
    const text = "@/Users/x/foo.md is here";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs[0].raw).toBe("@/Users/x/foo.md");
  });

  it("detects relative @./foo.md and @../bar.md", () => {
    const text = "@./foo.md and @../bar.md";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs.map((r) => r.raw)).toEqual(["@./foo.md", "@../bar.md"]);
  });

  it("strips trailing punctuation .,;:)", () => {
    const text = "ref @~/foo.md, then @~/bar.md; and @~/baz.md.";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs.map((r) => r.raw)).toEqual([
      "@~/foo.md",
      "@~/bar.md",
      "@~/baz.md",
    ]);
  });

  it("does not match @ without a path-prefix", () => {
    const text = "email me @ alice or version @v1";
    expect(parseRefs(text, { detectBackticks: false })).toEqual([]);
  });

  it("treats escaped tilde \\~/ as literal text", () => {
    const text = "literal @\\~/foo.md";
    expect(parseRefs(text, { detectBackticks: false })).toEqual([]);
  });

  it("supports multiple refs on one line", () => {
    const text = "@~/a.md @~/b.md @~/c.md";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs).toHaveLength(3);
  });

  it("terminates at line ends", () => {
    const text = "@~/foo.md\n@~/bar.md";
    const refs = parseRefs(text, { detectBackticks: false });
    expect(refs).toHaveLength(2);
    expect(refs[0].raw).toBe("@~/foo.md");
    expect(refs[1].raw).toBe("@~/bar.md");
  });
});

describe("parseRefs — backtick paths", () => {
  it("detects `~/foo.md` when detectBackticks is true", () => {
    const text = "open `~/foo.md` to see";
    const refs = parseRefs(text, { detectBackticks: true });
    expect(refs).toHaveLength(1);
    expect(refs[0].raw).toBe("`~/foo.md`");
  });

  it("detects `/abs/path` and `./rel/path`", () => {
    const text = "`/etc/hosts` and `./README.md`";
    const refs = parseRefs(text, { detectBackticks: true });
    expect(refs.map((r) => r.raw)).toEqual(["`/etc/hosts`", "`./README.md`"]);
  });

  it("ignores backticks that don't look like paths", () => {
    const text = "`useState` and `git status`";
    expect(parseRefs(text, { detectBackticks: true })).toEqual([]);
  });

  it("skips fenced code blocks", () => {
    const text = [
      "see `~/before.md`",
      "```",
      "echo `~/inside.md`",
      "```",
      "and `~/after.md`",
    ].join("\n");
    const refs = parseRefs(text, { detectBackticks: true });
    expect(refs.map((r) => r.raw)).toEqual([
      "`~/before.md`",
      "`~/after.md`",
    ]);
  });

  it("skips ~~~ fenced code blocks", () => {
    const text = "~~~\n`~/inside.md`\n~~~\n`~/after.md`";
    const refs = parseRefs(text, { detectBackticks: true });
    expect(refs.map((r) => r.raw)).toEqual(["`~/after.md`"]);
  });

  it("does not detect backtick refs when detectBackticks is false", () => {
    const text = "see `~/foo.md` here";
    expect(parseRefs(text, { detectBackticks: false })).toEqual([]);
  });

  it("requires a path separator (rejects `~` alone)", () => {
    const text = "literal `~` tilde";
    expect(parseRefs(text, { detectBackticks: true })).toEqual([]);
  });
});
