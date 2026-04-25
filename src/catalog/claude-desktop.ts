import type { CatalogEntry } from "./types";

const DOCS = "https://modelcontextprotocol.io/quickstart/user";

export const claudeDesktopEntries: CatalogEntry[] = [
  {
    id: "cd.user.config",
    tool: "claude-desktop",
    scope: "user",
    category: "settings",
    label: "claude_desktop_config.json",
    pathTemplate: "{claude_desktop_config}",
    kind: "file",
    language: "json",
    schemaId: "claude-desktop-config",
    docsUrl: DOCS,
  },
];
