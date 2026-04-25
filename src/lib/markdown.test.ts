import { describe, expect, test } from "vitest";
import { isAbsoluteUrl, stripFrontmatter } from "./markdown";

describe("stripFrontmatter", () => {
  test("removes a leading --- block", () => {
    const input = "---\ntitle: Hi\n---\n# Body\n";
    expect(stripFrontmatter(input)).toBe("# Body\n");
  });

  test("handles CRLF line endings", () => {
    const input = "---\r\ntitle: Hi\r\n---\r\nBody\r\n";
    expect(stripFrontmatter(input)).toBe("Body\r\n");
  });

  test("returns the source unchanged when there is no frontmatter", () => {
    const input = "# Just a heading\n";
    expect(stripFrontmatter(input)).toBe(input);
  });

  test("does not strip a --- that is not at the start of the file", () => {
    const input = "intro\n\n---\nname: x\n---\n";
    expect(stripFrontmatter(input)).toBe(input);
  });

  test("handles an empty frontmatter block", () => {
    expect(stripFrontmatter("---\n---\nrest")).toBe("rest");
  });
});

describe("isAbsoluteUrl", () => {
  test("recognises http and https", () => {
    expect(isAbsoluteUrl("http://example.com")).toBe(true);
    expect(isAbsoluteUrl("https://example.com/x")).toBe(true);
  });

  test("recognises mailto", () => {
    expect(isAbsoluteUrl("mailto:foo@bar.com")).toBe(true);
  });

  test("rejects relative paths and anchors", () => {
    expect(isAbsoluteUrl("./foo.md")).toBe(false);
    expect(isAbsoluteUrl("/abs/path")).toBe(false);
    expect(isAbsoluteUrl("#heading")).toBe(false);
    expect(isAbsoluteUrl("foo.md")).toBe(false);
  });

  test("rejects undefined / empty input", () => {
    expect(isAbsoluteUrl(undefined)).toBe(false);
    expect(isAbsoluteUrl("")).toBe(false);
  });
});
