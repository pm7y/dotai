import { describe, it, expect } from "vitest";
import { buildManifest, parseManifest, sha256Hex } from "./manifest";
import type { SnapshotFileEntry } from "./types";

describe("sha256Hex", () => {
  it("produces a 64-char hex digest", async () => {
    const digest = await sha256Hex("hello");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("buildManifest", () => {
  it("sets schemaVersion=1 and copies fields", () => {
    const files: SnapshotFileEntry[] = [
      {
        entryId: "cc.user.settings",
        scope: "user",
        relativePath: "settings.json",
        sizeBytes: 12,
        sha256: "a".repeat(64),
      },
    ];
    const m = buildManifest({
      machineId: "work-laptop",
      machineLabel: "Work laptop",
      hostname: "host.local",
      platform: "darwin",
      pushedAtMs: 1714032000000,
      dotaiVersion: "0.1.0",
      files,
    });
    expect(m.schemaVersion).toBe(1);
    expect(m.machineId).toBe("work-laptop");
    expect(m.files).toEqual(files);
  });
});

describe("parseManifest", () => {
  it("round-trips a built manifest", () => {
    const built = buildManifest({
      machineId: "m",
      machineLabel: "M",
      hostname: "h",
      platform: "linux",
      pushedAtMs: 1,
      dotaiVersion: "0.1.0",
      files: [],
    });
    const json = JSON.stringify(built);
    expect(parseManifest(json)).toEqual(built);
  });

  it("rejects non-object JSON", () => {
    expect(() => parseManifest("123")).toThrow();
    expect(() => parseManifest("null")).toThrow();
  });

  it("rejects unknown schemaVersion", () => {
    expect(() => parseManifest('{"schemaVersion":2}')).toThrow(/schemaVersion/i);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseManifest("{not json")).toThrow();
  });
});
