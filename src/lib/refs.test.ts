import { describe, it, expect } from "vitest";
import { parseRefs, resolveRefPath, findRefs } from "./refs";

describe("parseRefs — @-prefix references", () => {
  it("detects @$HOME/...", () => {
    const text = "see @$HOME/.claude/foo.md for details";
    expect(parseRefs(text)).toEqual([
      { start: 4, end: 25, raw: "@$HOME/.claude/foo.md" },
    ]);
  });

  it("detects @${HOME}/...", () => {
    const text = "see @${HOME}/.claude/foo.md for details";
    const refs = parseRefs(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].raw).toBe("@${HOME}/.claude/foo.md");
  });

  it("detects @~/...", () => {
    const text = "see @~/.claude/foo.md.";
    const refs = parseRefs(text);
    expect(refs).toHaveLength(1);
    // Trailing period is stripped from the captured ref.
    expect(refs[0].raw).toBe("@~/.claude/foo.md");
    expect(refs[0].start).toBe(4);
    expect(refs[0].end).toBe(21);
  });

  it("detects absolute @/foo/bar.md", () => {
    const text = "@/Users/x/foo.md is here";
    const refs = parseRefs(text);
    expect(refs[0].raw).toBe("@/Users/x/foo.md");
  });

  it("detects relative @./foo.md and @../bar.md", () => {
    const text = "@./foo.md and @../bar.md";
    const refs = parseRefs(text);
    expect(refs.map((r) => r.raw)).toEqual(["@./foo.md", "@../bar.md"]);
  });

  it("strips trailing punctuation .,;:)", () => {
    const text = "ref @~/foo.md, then @~/bar.md; and @~/baz.md.";
    const refs = parseRefs(text);
    expect(refs.map((r) => r.raw)).toEqual(["@~/foo.md", "@~/bar.md", "@~/baz.md"]);
  });

  it("does not match @ without a path-prefix", () => {
    const text = "email me @ alice or version @v1";
    expect(parseRefs(text)).toEqual([]);
  });

  it("treats escaped tilde \\~/ as literal text", () => {
    const text = "literal @\\~/foo.md";
    expect(parseRefs(text)).toEqual([]);
  });

  it("supports multiple refs on one line", () => {
    const text = "@~/a.md @~/b.md @~/c.md";
    const refs = parseRefs(text);
    expect(refs).toHaveLength(3);
  });

  it("terminates at line ends", () => {
    const text = "@~/foo.md\n@~/bar.md";
    const refs = parseRefs(text);
    expect(refs).toHaveLength(2);
    expect(refs[0].raw).toBe("@~/foo.md");
    expect(refs[1].raw).toBe("@~/bar.md");
  });

  it("does not detect path-like content inside backticks", () => {
    const text = "see `~/foo.md` here";
    expect(parseRefs(text)).toEqual([]);
  });
});

describe("resolveRefPath", () => {
  const home = "/Users/alice";

  it("expands @$HOME/...", () => {
    expect(resolveRefPath("@$HOME/.claude/foo.md", { home, contextDir: null })).toBe(
      "/Users/alice/.claude/foo.md",
    );
  });

  it("expands @${HOME}/...", () => {
    expect(resolveRefPath("@${HOME}/.claude/foo.md", { home, contextDir: null })).toBe(
      "/Users/alice/.claude/foo.md",
    );
  });

  it("expands @~/...", () => {
    expect(resolveRefPath("@~/.claude/foo.md", { home, contextDir: null })).toBe(
      "/Users/alice/.claude/foo.md",
    );
  });

  it("returns absolute @/... unchanged (normalised)", () => {
    expect(resolveRefPath("@/etc/hosts", { home, contextDir: null })).toBe(
      "/etc/hosts",
    );
  });

  it("resolves @./foo.md against contextDir", () => {
    expect(
      resolveRefPath("@./bar.md", {
        home,
        contextDir: "/Users/alice/project/sub",
      }),
    ).toBe("/Users/alice/project/sub/bar.md");
  });

  it("resolves @../bar.md against contextDir", () => {
    expect(
      resolveRefPath("@../bar.md", {
        home,
        contextDir: "/Users/alice/project/sub",
      }),
    ).toBe("/Users/alice/project/bar.md");
  });

  it("normalises .. and . segments", () => {
    expect(
      resolveRefPath("@$HOME/foo/../bar/./baz.md", { home, contextDir: null }),
    ).toBe("/Users/alice/bar/baz.md");
  });

  it("strips a #fragment from the path", () => {
    expect(resolveRefPath("@~/foo.md#section", { home, contextDir: null })).toBe(
      "/Users/alice/foo.md",
    );
  });

  it("returns null when relative ref has no contextDir", () => {
    expect(resolveRefPath("@./foo.md", { home, contextDir: null })).toBeNull();
  });
});

describe("findRefs", () => {
  const home = "/Users/alice";

  it("combines parseRefs and resolveRefPath", () => {
    const text = "see @~/foo.md and @./bar.md here";
    const result = findRefs(text, { home, contextDir: "/Users/alice/proj" });
    expect(result).toEqual([
      {
        start: 4,
        end: 13,
        raw: "@~/foo.md",
        absolutePath: "/Users/alice/foo.md",
      },
      {
        start: 18,
        end: 27,
        raw: "@./bar.md",
        absolutePath: "/Users/alice/proj/bar.md",
      },
    ]);
  });

  it("drops refs that fail to resolve", () => {
    // @./foo.md without a contextDir resolves to null.
    const text = "@./foo.md and @~/bar.md";
    const result = findRefs(text, { home, contextDir: null });
    expect(result).toHaveLength(1);
    expect(result[0].absolutePath).toBe("/Users/alice/bar.md");
  });
});
