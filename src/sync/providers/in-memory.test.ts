import { describe, it, expect } from "vitest";
import { InMemoryProvider } from "./in-memory";
import { joinRemote } from "./types";

describe("joinRemote", () => {
  it("joins POSIX-style and collapses extra slashes", () => {
    expect(joinRemote("dotai", "work-laptop", "manifest.json")).toBe(
      "dotai/work-laptop/manifest.json",
    );
    expect(joinRemote("dotai/", "/work-laptop/", "manifest.json")).toBe(
      "dotai/work-laptop/manifest.json",
    );
  });

  it("rejects empty or '..' segments", () => {
    expect(() => joinRemote("dotai", "..", "x")).toThrow();
    expect(() => joinRemote("dotai", "", "x")).toThrow();
  });
});

describe("InMemoryProvider", () => {
  it("writes then reads round-trip", async () => {
    const p = new InMemoryProvider();
    await p.writeText("a/b/c.txt", "hello");
    expect(await p.readText("a/b/c.txt")).toBe("hello");
  });

  it("readText throws on unknown path", async () => {
    const p = new InMemoryProvider();
    await expect(p.readText("missing")).rejects.toThrow(/not found/i);
  });

  it("list returns recursive entries with the prefix", async () => {
    const p = new InMemoryProvider();
    await p.writeText("dotai/m1/manifest.json", "{}");
    await p.writeText("dotai/m1/files/x.txt", "x");
    await p.writeText("dotai/m2/manifest.json", "{}");
    await p.writeText("other/y.txt", "y");
    const entries = await p.list("dotai/");
    const paths = entries.map((e) => e.path).sort();
    expect(paths).toEqual([
      "dotai/m1/files/x.txt",
      "dotai/m1/manifest.json",
      "dotai/m2/manifest.json",
    ]);
  });

  it("list is empty for an unknown prefix", async () => {
    const p = new InMemoryProvider();
    expect(await p.list("nope/")).toEqual([]);
  });

  it("writeText overwrites existing content", async () => {
    const p = new InMemoryProvider();
    await p.writeText("k", "v1");
    await p.writeText("k", "v2");
    expect(await p.readText("k")).toBe("v2");
  });
});
