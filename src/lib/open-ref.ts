import { entryForPath } from "@/lib/ad-hoc";
import type { CatalogEntry } from "@/catalog";
import type { Selection } from "@/state/selection";

export type OpenRefDeps = {
  // Optional sync lookup: given an absolute path, return a real catalog entry
  // that resolves to it, or null. When omitted, every navigation produces a
  // synthetic-entry selection. v1 omits it; a future change can add a
  // resolved-path index and pass it through here without an API change.
  findCatalogEntryByPath?: (absolutePath: string) => CatalogEntry | null;
};

export function nextSelectionForPath(
  absolutePath: string,
  current: Selection,
  deps: OpenRefDeps = {},
): Selection {
  const real = deps.findCatalogEntryByPath?.(absolutePath) ?? null;
  if (real) {
    return {
      tool: real.tool,
      scope: real.scope,
      entryId: real.id,
      filePath: absolutePath,
    };
  }
  // Keep `entryId` so the FileList stays anchored to the originating
  // category. The Editor reads `syntheticEntry` first (see below) so the
  // editor view follows the link target while the sidebar holds context.
  return {
    tool: current.tool,
    scope: current.scope,
    entryId: current.entryId,
    filePath: absolutePath,
    syntheticEntry: entryForPath(absolutePath),
  };
}
