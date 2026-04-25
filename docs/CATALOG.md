# Catalog

The catalog (`src/catalog/`) declares every known config location. Adding a new one requires no Rust rebuild.

## Entry shape

```ts
type CatalogEntry = {
  id: string;                    // stable, dot-namespaced (e.g. "cc.user.settings")
  tool: "claude-code" | "claude-desktop" | "copilot-cli";
  scope: "user" | "project" | "project-local";
  category: "settings" | "memory" | "mcp" | "agents" | ...;
  label: string;                 // sidebar label
  pathTemplate: string;          // tokens: {home}, {project}, {copilot_home}, {claude_desktop_config}, {appdata}
  kind: "file" | "glob" | "dir-of-files" | "env";
  fileGlob?: string;             // e.g. "*.md" or "*/SKILL.md"
  language: "json" | "jsonc" | "markdown" | "toml" | "env";
  schemaId?: string;             // → src/schemas/*.schema.json
  frontmatterSchemaId?: string;  // for markdown with YAML frontmatter
  docsUrl: string;
  notes?: string;                // shown as a banner in the editor
  envVars?: string[];            // for kind: "env"
};
```

## Path tokens

| Token | macOS | Windows | Linux |
|-------|-------|---------|-------|
| `{home}` | `~` | `%USERPROFILE%` | `~` |
| `{project}` | user-picked dir | same | same |
| `{copilot_home}` | `$COPILOT_HOME` or `~/.copilot` | same | same |
| `{claude_desktop_config}` | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%/Claude/claude_desktop_config.json` | `~/.config/Claude/claude_desktop_config.json` |
| `{appdata}` | Tauri's `appDataDir` | same | same |

## Adding an entry

1. Edit `src/catalog/{tool}.ts`.
2. Restart `pnpm dev` (no Rust rebuild needed unless you're adding a new path token).

## Why "scope: project-local"?

Files like `.claude/settings.local.json` and `CLAUDE.local.md` are gitignored. Surfacing them under "Project (local)" rather than "Project" prevents users from accidentally committing local overrides.
