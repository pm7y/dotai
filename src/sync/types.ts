import type { ReadResult, FileMeta, DirEntryDto } from "@/lib/tauri";
import type { Scope } from "@/catalog";

/** POSIX-style relative path, e.g. "work-laptop/manifest.json". */
export type RemotePath = string;

export type RemoteEntry = {
  path: RemotePath;
  sizeBytes: number;
  mtimeMs?: number;
};

export interface SyncProvider {
  readonly id: string;
  readonly label: string;
  /** Recursive listing of files under prefix. Files only — directories are implied by paths. */
  list(prefix: RemotePath): Promise<RemoteEntry[]>;
  readText(path: RemotePath): Promise<string>;
  writeText(path: RemotePath, content: string): Promise<void>;
}

export type ProviderConfig = { kind: "filesystem"; rootPath: string };

export type SnapshotFileEntry = {
  entryId: string;
  scope: Scope;
  /** For project-scoped entries only. */
  projectSlug?: string;
  /** For project-scoped entries only — informational. */
  projectAbsPath?: string;
  /** Path within the entry-id folder (single filename for `kind:"file"`, sub-path for dir entries). */
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  sourceMtimeMs?: number;
};

export type SnapshotManifest = {
  schemaVersion: 1;
  machineId: string;
  machineLabel: string;
  hostname: string;
  platform: "darwin" | "linux" | "win32";
  pushedAtMs: number;
  dotaiVersion: string;
  files: SnapshotFileEntry[];
};

/** Injection seam over local IO so snapshot logic is testable without Tauri. */
export interface LocalIO {
  resolvePath(template: string, project?: string | null): Promise<string>;
  statPath(path: string): Promise<FileMeta>;
  listDir(path: string, glob?: string): Promise<DirEntryDto[]>;
  readFile(path: string): Promise<ReadResult>;
  writeFile(args: {
    path: string;
    content: string;
    lineEnding?: "lf" | "crlf";
    mode?: number | null;
    backupDir?: string | null;
  }): Promise<{ sizeBytes: number; mtimeMs?: number | null }>;
}
