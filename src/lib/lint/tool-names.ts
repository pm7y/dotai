// Built-in Claude Code agent tools. Maintained manually; refresh from
// https://docs.claude.com/en/docs/claude-code/sub-agents when adding new tools.
// MCP tools match the `mcp__*` pattern instead of being listed here.
export const BUILTIN_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "LS",
  "NotebookEdit",
  "NotebookRead",
  "WebFetch",
  "WebSearch",
  "Task",
  "ExitPlanMode",
  "TodoWrite",
  "AskUserQuestion",
]);

const MCP_PATTERN = /^mcp__[a-zA-Z0-9_-]+(__[a-zA-Z0-9_*-]+)?$/;

export function isKnownTool(name: string): boolean {
  return BUILTIN_TOOLS.has(name) || MCP_PATTERN.test(name);
}
