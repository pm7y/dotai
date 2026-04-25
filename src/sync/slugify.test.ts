import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases ASCII alphanumerics + hyphens", () => {
    expect(slugify("Work Laptop")).toBe("work-laptop");
  });

  it("collapses runs of separators", () => {
    expect(slugify("Pauls' MacBook  Pro!!!")).toBe("pauls-macbook-pro");
  });

  it("strips leading and trailing separators", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("transliterates basic non-ASCII", () => {
    expect(slugify("café")).toBe("cafe");
    expect(slugify("naïve")).toBe("naive");
  });

  it("returns 'machine' for empty / all-separator input", () => {
    expect(slugify("")).toBe("machine");
    expect(slugify("---")).toBe("machine");
  });

  it("truncates to 64 chars", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBe(64);
  });

  it("dedupes against takenSet by appending -2, -3, ...", () => {
    const taken = new Set(["work-laptop", "work-laptop-2"]);
    expect(slugify("Work Laptop", taken)).toBe("work-laptop-3");
  });

  it("returns the same slug if not taken", () => {
    expect(slugify("Work Laptop", new Set(["other"]))).toBe("work-laptop");
  });

  it("dedupe does not exceed 64 chars when base is at the limit", () => {
    const base = slugify("a".repeat(100));
    const taken = new Set([base]);
    const result = slugify("a".repeat(100), taken);
    expect(result.length).toBeLessThanOrEqual(64);
    expect(result).toBe("a".repeat(62) + "-2");
  });
});
