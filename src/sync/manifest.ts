import type { SnapshotFileEntry, SnapshotManifest } from "./types";

export async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  const hex: string[] = [];
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i += 1) {
    hex.push(view[i].toString(16).padStart(2, "0"));
  }
  return hex.join("");
}

export function buildManifest(args: {
  machineId: string;
  machineLabel: string;
  hostname: string;
  platform: SnapshotManifest["platform"];
  pushedAtMs: number;
  dotaiVersion: string;
  files: SnapshotFileEntry[];
}): SnapshotManifest {
  return {
    schemaVersion: 1,
    machineId: args.machineId,
    machineLabel: args.machineLabel,
    hostname: args.hostname,
    platform: args.platform,
    pushedAtMs: args.pushedAtMs,
    dotaiVersion: args.dotaiVersion,
    files: args.files,
  };
}

export function parseManifest(json: string): SnapshotManifest {
  const obj: unknown = JSON.parse(json);
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("manifest: expected JSON object");
  }
  const m = obj as Record<string, unknown>;
  if (m.schemaVersion !== 1) {
    throw new Error(
      `manifest: unsupported schemaVersion ${String(m.schemaVersion)}`,
    );
  }
  return m as unknown as SnapshotManifest;
}
