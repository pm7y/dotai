import { describe, it, expect } from "vitest";
import { InMemoryProvider } from "./providers/in-memory";
import { listMachines, pushSnapshot, readRemoteFile } from "./api";
import { buildManifest } from "./manifest";

describe("pushSnapshot", () => {
  it("writes files first, manifest last (manifest-last invariant)", async () => {
    const provider = new InMemoryProvider();
    const writes: string[] = [];
    const wrap = new Proxy(provider, {
      get(target, prop) {
        if (prop === "writeText") {
          return async (path: string, content: string) => {
            writes.push(path);
            await provider.writeText(path, content);
          };
        }
        return (target as never)[prop as never];
      },
    });
    await pushSnapshot({
      provider: wrap as unknown as InMemoryProvider,
      machineSlug: "m1",
      machineLabel: "M1",
      hostname: "host",
      platform: "darwin",
      dotaiVersion: "0.1.0",
      collected: {
        files: [
          { remotePath: "files/cc.user.settings/settings.json", content: "{}", entryId: "cc.user.settings" },
        ],
        manifestFiles: [
          {
            entryId: "cc.user.settings",
            scope: "user",
            relativePath: "settings.json",
            sizeBytes: 2,
            sha256: "x".repeat(64),
          },
        ],
      },
    });
    expect(writes[writes.length - 1]).toBe("dotai/m1/manifest.json");
    expect(writes).toContain("dotai/m1/files/cc.user.settings/settings.json");
  });
});

describe("listMachines", () => {
  it("discovers machines by manifest path pattern", async () => {
    const p = new InMemoryProvider();
    const m1 = buildManifest({
      machineId: "m1",
      machineLabel: "M1",
      hostname: "h",
      platform: "darwin",
      pushedAtMs: 1,
      dotaiVersion: "0.1.0",
      files: [],
    });
    const m2 = buildManifest({
      machineId: "m2",
      machineLabel: "M2",
      hostname: "h",
      platform: "linux",
      pushedAtMs: 2,
      dotaiVersion: "0.1.0",
      files: [],
    });
    await p.writeText("dotai/m1/manifest.json", JSON.stringify(m1));
    await p.writeText("dotai/m1/files/cc.user.settings/settings.json", "{}");
    await p.writeText("dotai/m2/manifest.json", JSON.stringify(m2));
    await p.writeText("dotai/m1/notes-not-a-manifest.txt", "noise");
    const machines = await listMachines(p);
    const ids = machines.map((m) => m.machineId).sort();
    expect(ids).toEqual(["m1", "m2"]);
  });

  it("skips folders without a manifest", async () => {
    const p = new InMemoryProvider();
    await p.writeText("dotai/orphan/files/x.txt", "x");
    const machines = await listMachines(p);
    expect(machines).toEqual([]);
  });
});

describe("readRemoteFile", () => {
  it("reads via the provider at the manifest's remote path", async () => {
    const p = new InMemoryProvider();
    await p.writeText("dotai/m1/files/cc.user.memory/CLAUDE.md", "hi");
    expect(
      await readRemoteFile(p, "m1", "files/cc.user.memory/CLAUDE.md"),
    ).toBe("hi");
  });
});
