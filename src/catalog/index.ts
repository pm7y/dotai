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
