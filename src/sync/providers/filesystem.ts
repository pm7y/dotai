import type {
  LocalIO,
  ProviderConfig,
  RemoteEntry,
  RemotePath,
  SyncProvider,
} from "../types";

export class FilesystemProvider implements SyncProvider {
  readonly id = "filesystem";
  readonly label = "Local folder";
  private root: string;

  constructor(
    config: ProviderConfig & { kind: "filesystem" },
    private io: LocalIO,
  ) {
    this.root = config.rootPath.replace(/\/+$/, "");
  }

  async list(prefix: RemotePath): Promise<RemoteEntry[]> {
    const dir = this.toAbs(prefix);
    const stat = await this.io.statPath(dir);
    if (!stat.exists || !stat.isDir) return [];
    const entries = await this.io.listDir(dir);
    const trimmedPrefix = stripTrailingSlash(prefix);
    return entries
      .filter((e) => !e.isDir)
      .map((e) => ({
        path: trimmedPrefix ? `${trimmedPrefix}/${e.name}` : e.name,
        sizeBytes: e.sizeBytes,
        mtimeMs: e.mtimeMs ?? undefined,
      }));
  }

  async readText(p: RemotePath): Promise<string> {
    const r = await this.io.readFile(this.toAbs(p));
    return r.content;
  }

  async writeText(p: RemotePath, content: string): Promise<void> {
    await this.io.writeFile({ path: this.toAbs(p), content, lineEnding: "lf" });
  }

  private toAbs(remote: RemotePath): string {
    const clean = remote.replace(/^\/+/, "");
    return clean ? `${this.root}/${clean}` : this.root;
  }
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}
