import {
  resolvePath,
  statPath,
  listDir,
  readFile,
  writeFile,
} from "./tauri";
import type { LocalIO } from "@/sync/types";

export const tauriLocalIO: LocalIO = {
  resolvePath,
  statPath,
  listDir,
  readFile,
  writeFile: (args) =>
    writeFile(args).then((r) => ({ sizeBytes: r.sizeBytes, mtimeMs: r.mtimeMs })),
};
