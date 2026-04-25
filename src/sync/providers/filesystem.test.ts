import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { FilesystemProvider } from "./filesystem";
import { nodeIO } from "../test-helpers/node-io";

describe("FilesystemProvider", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "dotai-fs-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("writeText creates parent dirs and persists content", async () => {
    const p = new FilesystemProvider({ kind: "filesystem", rootPath: root }, nodeIO());
    await p.writeText("dotai/m1/files/x/y.txt", "hello");
    const onDisk = await fs.readFile(path.join(root, "dotai/m1/files/x/y.txt"), "utf8");
    expect(onDisk).toBe("hello");
  });

  it("readText returns previously written content", async () => {
    const p = new FilesystemProvider({ kind: "filesystem", rootPath: root }, nodeIO());
    await p.writeText("dotai/m1/manifest.json", '{"k":1}');
    expect(await p.readText("dotai/m1/manifest.json")).toBe('{"k":1}');
  });

  it("list returns flat recursive entries with the prefix", async () => {
    const p = new FilesystemProvider({ kind: "filesystem", rootPath: root }, nodeIO());
    await p.writeText("dotai/m1/manifest.json", "{}");
    await p.writeText("dotai/m1/files/a.txt", "a");
    await p.writeText("dotai/m2/manifest.json", "{}");
    const entries = await p.list("dotai/");
    const paths = entries.map((e) => e.path).sort();
    expect(paths).toEqual([
      "dotai/m1/files/a.txt",
      "dotai/m1/manifest.json",
      "dotai/m2/manifest.json",
    ]);
  });

  it("list returns empty when prefix does not exist", async () => {
    const p = new FilesystemProvider({ kind: "filesystem", rootPath: root }, nodeIO());
    expect(await p.list("nope/")).toEqual([]);
  });
});
