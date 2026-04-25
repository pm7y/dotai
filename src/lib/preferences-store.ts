import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("preferences.json");

export type ViewMode = "edit" | "split" | "preview";

const VIEW_MODE_KEY = "editor.viewMode";
const DEFAULT_VIEW_MODE: ViewMode = "split";

function isViewMode(value: unknown): value is ViewMode {
  return value === "edit" || value === "split" || value === "preview";
}

export async function loadViewMode(): Promise<ViewMode> {
  try {
    const value = await store.get<unknown>(VIEW_MODE_KEY);
    return isViewMode(value) ? value : DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

export async function saveViewMode(mode: ViewMode): Promise<void> {
  await store.set(VIEW_MODE_KEY, mode);
  await store.save();
}
