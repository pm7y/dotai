import { LazyStore } from "@tauri-apps/plugin-store";
import type { ProviderConfig } from "@/sync/types";

const store = new LazyStore("sync.json");

export type SyncSettings = {
  providerConfig: ProviderConfig | null;
  machineLabel: string;
  machineSlug: string;
  lastPushedAtMs: number | null;
};

const DEFAULT: SyncSettings = {
  providerConfig: null,
  machineLabel: "",
  machineSlug: "",
  lastPushedAtMs: null,
};

const KEY = "settings";

export async function loadSyncSettings(): Promise<SyncSettings> {
  try {
    const value = await store.get<SyncSettings>(KEY);
    return value ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export async function saveSyncSettings(settings: SyncSettings): Promise<void> {
  await store.set(KEY, settings);
  await store.save();
}
