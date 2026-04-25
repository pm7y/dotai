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

const VALID_PLATFORMS: ReadonlyArray<SnapshotManifest["platform"]> = [
  "darwin",
  "linux",
  "win32",
];

export function parseManifest(json: string): SnapshotManifest {
  const obj: unknown = JSON.parse(json);
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("manifest: expected JSON object");
  }
  const m = obj as Record<string, unknown>;
  if (m.schemaVersion !== 1) {
    throw new Error(`manifest: unsupported schemaVersion ${String(m.schemaVersion)}`);
  }
  if (typeof m.machineId !== "string" || m.machineId.length === 0) {
    throw new Error("manifest: machineId must be a non-empty string");
  }
  if (typeof m.machineLabel !== "string") {
    throw new Error("manifest: machineLabel must be a string");
  }
  if (typeof m.hostname !== "string") {
    throw new Error("manifest: hostname must be a string");
  }
  if (
    typeof m.platform !== "string" ||
    !VALID_PLATFORMS.includes(m.platform as SnapshotManifest["platform"])
  ) {
    throw new Error(`manifest: invalid platform ${String(m.platform)}`);
  }
  if (typeof m.pushedAtMs !== "number" || !Number.isFinite(m.pushedAtMs)) {
    throw new Error("manifest: pushedAtMs must be a finite number");
  }
  if (typeof m.dotaiVersion !== "string") {
    throw new Error("manifest: dotaiVersion must be a string");
  }
  if (!Array.isArray(m.files)) {
    throw new Error("manifest: files must be an array");
  }
  for (let i = 0; i < m.files.length; i += 1) {
    validateFileEntry(m.files[i], i);
  }
  return m as unknown as SnapshotManifest;
}

function validateFileEntry(raw: unknown, index: number): void {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`manifest: files[${index}] must be an object`);
  }
  const f = raw as Record<string, unknown>;
  if (typeof f.entryId !== "string" || f.entryId.length === 0) {
    throw new Error(`manifest: files[${index}].entryId must be a non-empty string`);
  }
  if (typeof f.scope !== "string") {
    throw new Error(`manifest: files[${index}].scope must be a string`);
  }
  if (typeof f.relativePath !== "string") {
    throw new Error(`manifest: files[${index}].relativePath must be a string`);
  }
  if (typeof f.sizeBytes !== "number" || !Number.isFinite(f.sizeBytes)) {
    throw new Error(`manifest: files[${index}].sizeBytes must be a finite number`);
  }
  if (typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(f.sha256)) {
    throw new Error(`manifest: files[${index}].sha256 must be a 64-char hex string`);
  }
}
