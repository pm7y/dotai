import { atom } from "jotai";
import type { ViewMode } from "@/lib/preferences-store";

/**
 * Global editor view mode for markdown files.
 *
 * Hydrated from `preferences.json` by the Editor component on mount, and
 * written back via `saveViewMode` when the user changes it.
 */
export const viewModeAtom = atom<ViewMode>("split");
