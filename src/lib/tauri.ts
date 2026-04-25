import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type PathTokens = {
  home: string;
  copilotHome: string;
  claudeDesktopConfig: string;
  appData: string;
  appLocalData: string;
};

export type FileMeta = {
  absPath: string;
  exists: boolean;
  isDir: boolean;
  sizeBytes?: number | null;
  mtimeMs?: number | null;
  readable: boolean;
  writable: boolean;
};

export type DirEntryDto = {
  name: string;
  absPath: string;
  isDir: boolean;
  sizeBytes: number;
  mtimeMs?: number | null;
};

export type ReadResult = {
  content: string;
  sizeBytes: number;
  mtimeMs?: number | null;
  lineEnding: "lf" | "crlf";
  mode?: number | null;
};

export type WriteResult = {
  backupPath?: string | null;
  sizeBytes: number;
  mtimeMs?: number | null;
};

export type EnvVarDto = {
  name: string;
  value: string | null;
  masked: boolean;
  set: boolean;
};

export type SearchHit = {
  path: string;
  line: number;
  text: string;
};

export type WatchEvent = {
  watchId: string;
  paths: string[];
  kind: string;
};

function snake<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v;
  }
  return out;
}

function camel<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camel(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const ck = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      out[ck] = camel(v);
    }
    return out as T;
  }
  return value as T;
}

export async function getPathTokens(): Promise<PathTokens> {
  return camel(await invoke("get_path_tokens"));
}

export async function resolvePath(
  template: string,
  project?: string | null,
): Promise<string> {
  return invoke("resolve_path", { req: { template, project: project ?? null } });
}

export async function statPath(path: string): Promise<FileMeta> {
  return camel(await invoke("stat_path", { path }));
}

export async function listDir(path: string, glob?: string): Promise<DirEntryDto[]> {
  return camel(await invoke("list_dir", { path, glob: glob ?? null }));
}

export async function readFile(path: string): Promise<ReadResult> {
  return camel(await invoke("read_file", { path }));
}

export async function writeFile(args: {
  path: string;
  content: string;
  lineEnding?: "lf" | "crlf";
  mode?: number | null;
  backupDir?: string | null;
}): Promise<WriteResult> {
  return camel(await invoke("write_file", { req: snake(args) }));
}

export async function readEnvVars(names: string[]): Promise<EnvVarDto[]> {
  return camel(await invoke("read_env_vars", { req: { names } }));
}

export async function searchFiles(args: {
  query: string;
  paths: string[];
  caseInsensitive?: boolean;
  regex?: boolean;
}): Promise<SearchHit[]> {
  return camel(await invoke("search_files", { req: snake(args) }));
}

export async function startWatch(args: {
  watchId: string;
  paths: string[];
  recursive: boolean;
}): Promise<void> {
  await invoke("start_watch", { req: snake(args) });
}

export async function stopWatch(watchId: string): Promise<void> {
  await invoke("stop_watch", { watchId });
}

export async function onWatchEvent(
  handler: (e: WatchEvent) => void,
): Promise<UnlistenFn> {
  return listen<WatchEvent>("aifiles://watch", (ev) => handler(camel(ev.payload)));
}
