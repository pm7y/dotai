import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { LocalIO } from "../types";

export function nodeIO(): LocalIO {
  return {
    async resolvePath(template) {
      return template;
    },
    async statPath(p) {
      try {
        const s = await fsp.stat(p);
        return {
          absPath: p,
          exists: true,
          isDir: s.isDirectory(),
          readable: true,
          writable: true,
          sizeBytes: s.size,
          mtimeMs: s.mtimeMs,
        };
      } catch {
        return {
          absPath: p,
          exists: false,
          isDir: false,
          readable: false,
          writable: false,
          sizeBytes: null,
          mtimeMs: null,
        };
      }
    },
    async listDir(dir) {
      const out: Array<{
        name: string;
        absPath: string;
        isDir: boolean;
        sizeBytes: number;
        mtimeMs: number | null;
      }> = [];
      const stack = [dir];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        const entries = await fsp.readdir(cur, { withFileTypes: true });
        for (const e of entries) {
          const abs = path.join(cur, e.name);
          if (e.isDirectory()) {
            stack.push(abs);
          } else {
            const s = await fsp.stat(abs);
            out.push({
              name: path.relative(dir, abs),
              absPath: abs,
              isDir: false,
              sizeBytes: s.size,
              mtimeMs: s.mtimeMs,
            });
          }
        }
      }
      return out;
    },
    async readFile(p) {
      const content = await fsp.readFile(p, "utf8");
      const stat = await fsp.stat(p);
      return {
        content,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
        lineEnding: content.includes("\r\n") ? "crlf" : "lf",
        mode: null,
      };
    },
    async writeFile(args) {
      await fsp.mkdir(path.dirname(args.path), { recursive: true });
      await fsp.writeFile(args.path, args.content, "utf8");
      const stat = await fsp.stat(args.path);
      return { sizeBytes: stat.size, mtimeMs: stat.mtimeMs };
    },
  };
}
