import { claudeCodeEntries } from "./claude-code";
import { claudeDesktopEntries } from "./claude-desktop";
import { copilotEntries } from "./copilot";
import type { CatalogEntry, ToolId, Scope } from "./types";

export * from "./types";

export const CATALOG: CatalogEntry[] = [
  ...claudeCodeEntries,
  ...claudeDesktopEntries,
  ...copilotEntries,
];

export function entriesForTool(tool: ToolId): CatalogEntry[] {
  return CATALOG.filter((e) => e.tool === tool);
}

export function entriesForToolScope(tool: ToolId, scope: Scope): CatalogEntry[] {
  return CATALOG.filter((e) => e.tool === tool && e.scope === scope);
}

export function entryById(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id);
}

/**
 * Marker paths used by `scanProjects` to detect a project directory. We keep
 * these here (not in Rust) so adding a new tool only touches TS. Bare
 * filenames like `CLAUDE.md` are excluded — they're too generic to mark a
 * project on their own.
 */
export const PROJECT_SCAN_MARKERS: readonly string[] = [
  ".claude",
  ".mcp.json",
  ".copilot",
  ".github/agents",
  ".github/hooks",
];
