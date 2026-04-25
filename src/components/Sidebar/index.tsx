import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { useMemo, useState } from "react";
import { OtherMachinesSection } from "@/components/Sync/OtherMachinesSection";
import {
  CATEGORY_LABELS,
  SCOPE_LABELS,
  TOOL_LABELS,
  entriesForToolScope,
  type CatalogEntry,
  type Scope,
  type ToolId,
} from "@/catalog";
import { selectionAtom, projectAtom } from "@/state/selection";
import { projectsAtom } from "@/state/projects";
import { cn } from "@/lib/cn";

type ToolGroup = {
  tool: ToolId;
  scope: Scope;
  label: string;
  entries: CatalogEntry[];
  projectPath?: string;
};

export function Sidebar() {
  const [selection, setSelection] = useAtom(selectionAtom);
  const setActiveProject = useSetAtom(projectAtom);
  const projects = useAtomValue(projectsAtom);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "claude-code:user": true,
    "claude-desktop:user": true,
    "copilot-cli:user": true,
  });

  const toolGroups = useMemo<ToolGroup[]>(() => {
    const groups: ToolGroup[] = [];
    const tools: ToolId[] = ["claude-code", "claude-desktop", "copilot-cli"];
    for (const tool of tools) {
      groups.push({
        tool,
        scope: "user",
        label: SCOPE_LABELS.user,
        entries: entriesForToolScope(tool, "user"),
      });
      for (const project of projects) {
        const entries = [
          ...entriesForToolScope(tool, "project"),
          ...entriesForToolScope(tool, "project-local"),
        ];
        if (entries.length === 0) continue;
        groups.push({
          tool,
          scope: "project",
          label: project.name,
          entries,
          projectPath: project.path,
        });
      }
    }
    return groups;
  }, [projects]);

  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  return (
    <nav
      className="w-64 shrink-0 overflow-y-auto border-r border-(--color-border) bg-(--color-bg-subtle)"
      aria-label="Configuration sources"
    >
      {(["claude-code", "claude-desktop", "copilot-cli"] as ToolId[]).map((tool) => {
        const toolKey = `tool:${tool}`;
        const isToolOpen = expanded[toolKey] ?? true;
        const groups = toolGroups.filter((g) => g.tool === tool);
        return (
          <div key={tool} className="border-b border-(--color-border)">
            <button
              type="button"
              onClick={() => toggle(toolKey)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-(--color-fg-muted) hover:bg-(--color-bg-muted)"
            >
              {isToolOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>{TOOL_LABELS[tool]}</span>
            </button>
            {isToolOpen &&
              groups.map((group) => {
                const groupKey = `${tool}:${group.scope}:${group.projectPath ?? "user"}`;
                const isOpen = expanded[groupKey] ?? false;
                const categories = uniqueCategories(group.entries);
                return (
                  <div key={groupKey} className="pb-1">
                    <button
                      type="button"
                      onClick={() => toggle(groupKey)}
                      className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-[11px] text-(--color-fg-muted) hover:bg-(--color-bg-muted)"
                    >
                      {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      {group.scope === "project" && (
                        <FolderTree size={11} className="opacity-70" />
                      )}
                      <span className="truncate">{group.label}</span>
                    </button>
                    {isOpen && (
                      <ul className="pl-6">
                        {categories.map((cat) => {
                          const entries = group.entries.filter(
                            (e) => e.category === cat,
                          );
                          const isSelected = entries.some(
                            (e) => e.id === selection.entryId,
                          );
                          return (
                            <li key={cat}>
                              <button
                                type="button"
                                onClick={() => {
                                  const first = entries[0];
                                  if (group.projectPath) {
                                    setActiveProject(group.projectPath);
                                  }
                                  setSelection({
                                    tool,
                                    scope: first.scope,
                                    entryId: first.id,
                                    filePath: null,
                                  });
                                }}
                                className={cn(
                                  "flex w-full items-center rounded px-2 py-1 text-left text-[12px] hover:bg-(--color-bg-muted)",
                                  isSelected &&
                                    "bg-(--color-accent)/10 text-(--color-accent)",
                                )}
                              >
                                <span>{CATEGORY_LABELS[cat]}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
      <div className="border-t border-(--color-border) p-2">
        <OtherMachinesSection />
      </div>
    </nav>
  );
}

function uniqueCategories(entries: CatalogEntry[]) {
  const seen = new Set<string>();
  const out: CatalogEntry["category"][] = [];
  for (const e of entries) {
    if (!seen.has(e.category)) {
      seen.add(e.category);
      out.push(e.category);
    }
  }
  return out;
}
