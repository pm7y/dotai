import { describe, it, expect } from "vitest";
import { CATALOG } from "@/catalog";
import { isEntryExcluded, eligibleEntries } from "./exclusions";

describe("isEntryExcluded", () => {
  it("excludes env category entries", () => {
    const env = CATALOG.find((e) => e.kind === "env");
    expect(env).toBeDefined();
    expect(isEntryExcluded(env!)).toBe(true);
  });

  it("excludes the user statefile (cc.user.statefile)", () => {
    const sf = CATALOG.find((e) => e.id === "cc.user.statefile");
    expect(sf).toBeDefined();
    expect(isEntryExcluded(sf!)).toBe(true);
  });

  it("excludes project-local scope entries", () => {
    const local = CATALOG.find((e) => e.scope === "project-local");
    expect(local).toBeDefined();
    expect(isEntryExcluded(local!)).toBe(true);
  });

  it("includes user settings", () => {
    const us = CATALOG.find((e) => e.id === "cc.user.settings");
    expect(us).toBeDefined();
    expect(isEntryExcluded(us!)).toBe(false);
  });

  it("includes project memory", () => {
    const pm = CATALOG.find((e) => e.id === "cc.project.memory.root");
    expect(pm).toBeDefined();
    expect(isEntryExcluded(pm!)).toBe(false);
  });
});

describe("eligibleEntries", () => {
  it("returns a non-empty subset of the catalog", () => {
    const eligible = eligibleEntries();
    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.length).toBeLessThan(CATALOG.length);
  });

  it("never includes excluded entries", () => {
    const eligible = eligibleEntries();
    for (const e of eligible) {
      expect(isEntryExcluded(e)).toBe(false);
    }
  });
});
