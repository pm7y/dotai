import { buildManifest, parseManifest } from "./manifest";
import { joinRemote } from "./providers/types";
import type { CollectedSnapshot } from "./snapshot";
import type { RemotePath, SnapshotManifest, SyncProvider } from "./types";

const ROOT_PREFIX = "dotai";

export async function pushSnapshot(args: {
  provider: SyncProvider;
  machineSlug: string;
  machineLabel: string;
  hostname: string;
  platform: SnapshotManifest["platform"];
  dotaiVersion: string;
  collected: CollectedSnapshot;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const machineRoot = joinRemote(ROOT_PREFIX, args.machineSlug);
  const total = args.collected.files.length;

  for (let i = 0; i < args.collected.files.length; i += 1) {
    const f = args.collected.files[i];
    const path = joinRemote(machineRoot, ...f.remotePath.split("/"));
    await args.provider.writeText(path, f.content);
    args.onProgress?.(i + 1, total + 1);
  }

  const manifest = buildManifest({
    machineId: args.machineSlug,
    machineLabel: args.machineLabel,
    hostname: args.hostname,
    platform: args.platform,
    pushedAtMs: Date.now(),
    dotaiVersion: args.dotaiVersion,
    files: args.collected.manifestFiles,
  });
  await args.provider.writeText(
    joinRemote(machineRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  args.onProgress?.(total + 1, total + 1);
}

export async function listMachines(
  provider: SyncProvider,
): Promise<SnapshotManifest[]> {
  const entries = await provider.list(`${ROOT_PREFIX}/`);
  const manifestPaths = entries
    .map((e) => e.path)
    .filter((p) => isMachineManifestPath(p));
  const out: SnapshotManifest[] = [];
  for (const path of manifestPaths) {
    try {
      const json = await provider.readText(path);
      out.push(parseManifest(json));
    } catch {
      // Skip unreadable / malformed manifests; viewer treats as absent.
    }
  }
  return out;
}

function isMachineManifestPath(path: string): boolean {
  // Match exactly: dotai/<single-segment>/manifest.json
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === ROOT_PREFIX &&
    parts[1].length > 0 &&
    parts[2] === "manifest.json"
  );
}

export async function readRemoteFile(
  provider: SyncProvider,
  machineSlug: string,
  relativeRemotePath: RemotePath,
): Promise<string> {
  const path = joinRemote(ROOT_PREFIX, machineSlug, ...relativeRemotePath.split("/"));
  return provider.readText(path);
}
