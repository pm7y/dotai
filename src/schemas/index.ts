import claudeCodeSettings from "./claude-code-settings.schema.json";
import mcpConfig from "./mcp-config.schema.json";
import claudeDesktopConfig from "./claude-desktop-config.schema.json";
import copilotSettings from "./copilot-settings.schema.json";
import claudeKeybindings from "./claude-keybindings.schema.json";
import agentFrontmatter from "./frontmatter/agent.schema.json";
import skillFrontmatter from "./frontmatter/skill.schema.json";
import commandFrontmatter from "./frontmatter/command.schema.json";

export type JsonSchema = Record<string, unknown>;

const SCHEMAS: Record<string, JsonSchema> = {
  "claude-code-settings": claudeCodeSettings as JsonSchema,
  "mcp-config": mcpConfig as JsonSchema,
  "claude-desktop-config": claudeDesktopConfig as JsonSchema,
  "copilot-settings": copilotSettings as JsonSchema,
  "claude-keybindings": claudeKeybindings as JsonSchema,
  "agent-frontmatter": agentFrontmatter as JsonSchema,
  "skill-frontmatter": skillFrontmatter as JsonSchema,
  "command-frontmatter": commandFrontmatter as JsonSchema,
};

export function getSchema(id: string): JsonSchema | undefined {
  return SCHEMAS[id];
}
