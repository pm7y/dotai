export type ToolId = "claude-code" | "claude-desktop" | "copilot-cli";

export type Scope = "user" | "project" | "project-local";

export type Category =
  | "settings"
  | "memory"
  | "mcp"
  | "agents"
  | "commands"
  | "skills"
  | "hooks"
  | "rules"
  | "plugins"
  | "keybindings"
  | "env";

export type Language = "json" | "jsonc" | "markdown" | "toml" | "env";

export type EntryKind = "file" | "glob" | "dir-of-files" | "env";

export type CatalogEntry = {
  id: string;
  tool: ToolId;
  scope: Scope;
  category: Category;
  label: string;
  pathTemplate: string;
  kind: EntryKind;
  fileGlob?: string;
  language: Language;
  schemaId?: string;
  frontmatterSchemaId?: string;
  docsUrl: string;
  notes?: string;
  envVars?: string[];
};

export type ResolvedFile = {
  entryId: string;
  absPath: string;
  exists: boolean;
  isDir: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
};

export const TOOL_LABELS: Record<ToolId, string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  "copilot-cli": "Copilot CLI",
};

export const SCOPE_LABELS: Record<Scope, string> = {
  user: "User (Global)",
  project: "Project",
  "project-local": "Project (Local)",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  settings: "Settings",
  memory: "Memory",
  mcp: "MCP",
  agents: "Agents",
  commands: "Commands",
  skills: "Skills",
  hooks: "Hooks",
  rules: "Rules",
  plugins: "Plugins",
  keybindings: "Keybindings",
  env: "Environment",
};
