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
    const root = this.toAbs(prefix);
    const stat = await this.io.statPath(root);
    if (!stat.exists || !stat.isDir) return [];
    const out: RemoteEntry[] = [];
    await this.walk(root, stripTrailingSlash(prefix), out);
    return out;
  }

  // The Rust `list_dir` glob matcher is depth-bounded by the number of
  // glob segments and has no globstar — so we walk one level at a time.
  private async walk(
    absDir: string,
    relPrefix: string,
    out: RemoteEntry[],
  ): Promise<void> {
    const entries = await this.io.listDir(absDir);
    for (const e of entries) {
      const childRel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
      if (e.isDir) {
        await this.walk(e.absPath, childRel, out);
      } else {
        out.push({
          path: childRel,
          sizeBytes: e.sizeBytes,
          mtimeMs: e.mtimeMs ?? undefined,
        });
      }
    }
  }

  async readText(p: RemotePath): Promise<string> {
    const r = await this.io.readFile(this.toAbs(p));
    return r.content;
  }

  async writeText(p: RemotePath, content: string): Promise<void> {
    // Sync writes must preserve content byte-for-byte so the SHA-256 we
    // hashed pre-push still matches what gets read back. Don't pass
    // lineEnding — that would normalize CRLF and corrupt the digest.
    await this.io.writeFile({ path: this.toAbs(p), content });
  }

  private toAbs(remote: RemotePath): string {
    const clean = remote.replace(/^\/+/, "");
    return clean ? `${this.root}/${clean}` : this.root;
  }
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}
