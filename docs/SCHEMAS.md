# Schemas

Eight hand-rolled JSON Schemas live in `src/schemas/`. Five are top-level config schemas, three are YAML-frontmatter schemas for markdown files (agents/skills/commands).

| Schema ID | File | Used for |
|-----------|------|----------|
| `claude-code-settings` | `claude-code-settings.schema.json` | `~/.claude/settings.json`, project `.claude/settings.json`, `.claude/settings.local.json` |
| `mcp-config` | `mcp-config.schema.json` | `.mcp.json` (Claude Code) and `mcp-config.json` (Copilot) — same shape |
| `claude-desktop-config` | `claude-desktop-config.schema.json` | Claude Desktop's `claude_desktop_config.json` |
| `copilot-settings` | `copilot-settings.schema.json` | Copilot CLI `settings.json` |
| `claude-keybindings` | `claude-keybindings.schema.json` | `~/.claude/keybindings.json` |
| `agent-frontmatter` | `frontmatter/agent.schema.json` | Agent markdown files (`name`, `description`, `tools`, `model`, `color`) |
| `skill-frontmatter` | `frontmatter/skill.schema.json` | Skill markdown files (`name`, `description`, `allowed-tools`) |
| `command-frontmatter` | `frontmatter/command.schema.json` | Slash-command markdown files (`description`, `argument-hint`, `allowed-tools`, `model`) |

## How JSON validation works

`codemirror-json-schema` provides the editor extension. When a catalog entry has a `schemaId`, the editor uses that schema for completions and inline diagnostics.

## How frontmatter validation works

Custom linter (`src/lib/editor-extensions.ts`):
1. Extract YAML between the leading `---` markers.
2. Parse with `yaml`. On parse error, surface line + message.
3. Validate the parsed object against the schema with `ajv` (`addFormats` for `uri`/`date-time`).
4. For each ajv error, locate the line in the YAML by key prefix matching, and emit a CodeMirror diagnostic.

## Why hand-rolled (not vendored from the docs site)?

The official documentation doesn't publish per-tool JSON Schemas, and the upstream tools accept additional unknown keys without complaint. The schemas here aim to:

- Catch obvious typos (`additionalProperties: false` where safe; `additionalProperties: true` where the tool tolerates them).
- Constrain enums (e.g., `model: sonnet | opus | haiku | inherit`).
- Enforce required keys (e.g., agents need `name` + `description`).

When upstream changes break a schema, edit it. No regeneration step.
