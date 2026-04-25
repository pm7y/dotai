import { CATALOG, type CatalogEntry } from "@/catalog";

const EXCLUDED_ENTRY_IDS: ReadonlySet<string> = new Set([
  "cc.user.statefile", // ~/.claude.json — Claude Code rewrites this constantly
]);

export function isEntryExcluded(entry: CatalogEntry): boolean {
  if (EXCLUDED_ENTRY_IDS.has(entry.id)) return true;
  if (entry.kind === "env") return true;
  if (entry.scope === "project-local") return true;
  return false;
}

export function eligibleEntries(): CatalogEntry[] {
  return CATALOG.filter((e) => !isEntryExcluded(e));
}
