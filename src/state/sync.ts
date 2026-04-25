import { atom } from "jotai";
import type { SnapshotManifest } from "@/sync/types";
import type { SyncSettings } from "@/lib/sync-store";

export const syncSettingsAtom = atom<SyncSettings | null>(null);

/** Discriminated union — same pattern as other async-load atoms in this codebase. */
export type RemoteMachinesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; machines: SnapshotManifest[] }
  | { status: "error"; message: string };

export const remoteMachinesAtom = atom<RemoteMachinesState>({ status: "idle" });

export const selectedRemoteMachineAtom = atom<string | null>(null); // machineId

export type RemoteFileViewState =
  | { status: "idle" }
  | { status: "loading"; machineId: string; relativePath: string }
  | {
      status: "ready";
      machineId: string;
      relativePath: string;
      content: string;
      manifestSha256: string;
    }
  | { status: "error"; message: string };

export const remoteFileViewAtom = atom<RemoteFileViewState>({ status: "idle" });

export type PushState =
  | { status: "idle" }
  | { status: "pushing"; done: number; total: number }
  | { status: "error"; message: string };

export const pushStateAtom = atom<PushState>({ status: "idle" });
