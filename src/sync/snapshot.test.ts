import { describe, it, expect } from "vitest";
import { collectSnapshot } from "./snapshot";
import type { LocalIO } from "./types";
import type { ReadResult, FileMeta, DirEntryDto } from "@/lib/tauri";

function makeIO(files: Record<string, string>): LocalIO {
  return {
    async resolvePath(template, project) {
      return template
        .replace("{home}", "/home")
        .replace("{project}", project ?? "/no-project")
        .replace("{copilot_home}", "/home/.config/github-copilot")
        .replace("{claude_desktop_config}", "/home/.config/claude-desktop")
        .replace("{appdata}", "/home/.config");
    },
    async statPath(path): Promise<FileMeta> {
      const exists = files[path] !== undefined || hasChildren(files, path);
      const isDir = hasChildren(files, path);
      return {
        absPath: path,
        exists,
        isDir,
        readable: exists,
        writable: exists,
        sizeBytes: files[path] ? files[path].length : null,
        mtimeMs: 1,
      };
    },
    async listDir(path, glob): Promise<DirEntryDto[]> {
      const entries: DirEntryDto[] = [];
      const prefix = path.endsWith("/") ? path : `${path}/`;
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue;
        const rel = p.slice(prefix.length);
        if (matchesGlob(rel, glob ?? "*")) {
          entries.push({
            name: rel,
            absPath: p,
            isDir: false,
            sizeBytes: files[p].length,
            mtimeMs: 1,
          });
        }
      }
      return entries;
    },
    async readFile(path): Promise<ReadResult> {
      const content = files[path];
      if (content === undefined) throw new Error(`not found: ${path}`);
      return {
        content,
        sizeBytes: content.length,
        mtimeMs: 1,
        lineEnding: "lf",
        mode: null,
      };
    },
    async writeFile() {
      throw new Error("writeFile not used in snapshot tests");
    },
  };
}

function hasChildren(files: Record<string, string>, path: string): boolean {
  const prefix = path.endsWith("/") ? path : `${path}/`;
  return Object.keys(files).some((p) => p.startsWith(prefix));
}

function matchesGlob(name: string, glob: string): boolean {
  // Tiny matcher that supports the catalog's globs: "*", "*.md", "*/SKILL.md".
  if (glob === "*") return true;
  if (glob.startsWith("*")) return name.endsWith(glob.slice(1));
  if (glob.endsWith("/SKILL.md")) {
    return (
      name.endsWith("/SKILL.md") && !name.slice(0, -"/SKILL.md".length).includes("/")
    );
  }
  return name === glob;
}

describe("collectSnapshot", () => {
  it("collects user-scope file entries", async () => {
    const io = makeIO({
      "/home/.claude/settings.json": '{"k":1}',
      "/home/.claude/CLAUDE.md": "# memory",
    });
    const { files, manifestFiles } = await collectSnapshot({
      io,
      projects: [],
    });
    const settings = files.find((f) => f.entryId === "cc.user.settings");
    expect(settings).toBeDefined();
    expect(settings!.content).toBe('{"k":1}');
    expect(settings!.remotePath).toBe("files/cc.user.settings/settings.json");
    expect(manifestFiles.find((f) => f.entryId === "cc.user.settings")).toMatchObject({
      relativePath: "settings.json",
      sizeBytes: 7,
    });
  });

  it("expands dir-of-files entries with fileGlob", async () => {
    const io = makeIO({
      "/home/.claude/agents/code-reviewer.md": "agent",
      "/home/.claude/agents/test-runner.md": "agent",
      "/home/.claude/agents/.DS_Store": "junk",
    });
    const { files } = await collectSnapshot({ io, projects: [] });
    const agents = files.filter((f) => f.entryId === "cc.user.agents");
    expect(agents.map((a) => a.remotePath).sort()).toEqual([
      "files/cc.user.agents/code-reviewer.md",
      "files/cc.user.agents/test-runner.md",
    ]);
  });

  it("handles skill nested glob */SKILL.md", async () => {
    const io = makeIO({
      "/home/.claude/skills/foo/SKILL.md": "foo skill",
      "/home/.claude/skills/bar/SKILL.md": "bar skill",
      "/home/.claude/skills/foo/notes.md": "ignored",
    });
    const { files } = await collectSnapshot({ io, projects: [] });
    const skills = files.filter((f) => f.entryId === "cc.user.skills");
    expect(skills.map((s) => s.remotePath).sort()).toEqual([
      "files/cc.user.skills/bar/SKILL.md",
      "files/cc.user.skills/foo/SKILL.md",
    ]);
  });

  it("includes project-scope entries for known projects, slugs the project", async () => {
    const io = makeIO({
      "/Users/me/proj-x/CLAUDE.md": "# proj x",
    });
    const { files } = await collectSnapshot({
      io,
      projects: [{ id: "1", name: "Proj X", path: "/Users/me/proj-x" }],
    });
    const pmem = files.find((f) => f.entryId === "cc.project.memory.root");
    expect(pmem).toBeDefined();
    expect(pmem!.remotePath).toBe("files/cc.project.memory.root/proj-x/CLAUDE.md");
  });

  it("skips missing files silently", async () => {
    const io = makeIO({
      "/home/.claude/settings.json": "{}",
    });
    const { files } = await collectSnapshot({ io, projects: [] });
    expect(files.find((f) => f.entryId === "cc.user.settings")).toBeDefined();
    expect(files.find((f) => f.entryId === "cc.user.memory")).toBeUndefined();
  });

  it("excludes env, statefile, and project-local entries", async () => {
    const io = makeIO({
      "/home/.claude.json": '{"state":1}',
      "/home/.claude/settings.local.json": '{"x":1}',
    });
    const { files } = await collectSnapshot({ io, projects: [] });
    expect(files.find((f) => f.entryId === "cc.user.statefile")).toBeUndefined();
  });
});
