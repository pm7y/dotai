import type { RemoteEntry, RemotePath, SyncProvider } from "../types";

export class InMemoryProvider implements SyncProvider {
  readonly id = "in-memory";
  readonly label = "In Memory (test fixture)";
  private store = new Map<RemotePath, string>();

  async list(prefix: RemotePath): Promise<RemoteEntry[]> {
    const out: RemoteEntry[] = [];
    for (const [path, content] of this.store) {
      if (path.startsWith(prefix)) {
        out.push({ path, sizeBytes: content.length });
      }
    }
    return out;
  }

  async readText(path: RemotePath): Promise<string> {
    const v = this.store.get(path);
    if (v === undefined) {
      throw new Error(`InMemoryProvider: not found: ${path}`);
    }
    return v;
  }

  async writeText(path: RemotePath, content: string): Promise<void> {
    this.store.set(path, content);
  }
}
