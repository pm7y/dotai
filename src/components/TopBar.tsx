import { useAtom } from "jotai";
import { ChevronDown, FolderOpen, Search } from "lucide-react";
import { useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { projectsAtom, type Project } from "@/state/projects";
import { projectAtom } from "@/state/selection";

export function TopBar() {
  const [projects, setProjects] = useAtom(projectsAtom);
  const [project, setProject] = useAtom(projectAtom);
  const [open, setOpen] = useState(false);
  const current = projects.find((p) => p.path === project) ?? null;

  async function pickProject() {
    const picked = await openFolderDialog({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    const name = picked.split(/[\\/]/).filter(Boolean).pop() ?? picked;
    const next: Project = { id: picked, name, path: picked };
    setProjects((prev) =>
      prev.find((p) => p.path === picked) ? prev : [...prev, next],
    );
    setProject(picked);
    setOpen(false);
  }

  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-bg-subtle) px-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold tracking-tight">aifiles</span>
        <span className="text-[11px] text-(--color-fg-muted)">v0.1.0</span>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded border border-(--color-border) bg-(--color-bg) px-2 py-1 text-[12px] hover:bg-(--color-bg-muted)"
        >
          <FolderOpen size={12} />
          <span>{current?.name ?? "No project"}</span>
          <ChevronDown size={11} />
        </button>
        {open && (
          <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded border border-(--color-border) bg-(--color-bg) shadow-lg">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProject(p.path);
                  setOpen(false);
                }}
                className="flex w-full flex-col px-3 py-1.5 text-left text-[12px] hover:bg-(--color-bg-muted)"
              >
                <span>{p.name}</span>
                <span className="truncate text-[10px] text-(--color-fg-muted)">
                  {p.path}
                </span>
              </button>
            ))}
            {projects.length > 0 && (
              <div className="border-t border-(--color-border)" />
            )}
            <button
              type="button"
              onClick={pickProject}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-(--color-accent) hover:bg-(--color-bg-muted)"
            >
              <FolderOpen size={12} />
              Add project…
            </button>
            {project && (
              <button
                type="button"
                onClick={() => {
                  setProject(null);
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-[12px] text-(--color-fg-muted) hover:bg-(--color-bg-muted)"
              >
                Clear selection
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-(--color-fg-muted)">
        <Search size={12} />
        <span className="rounded border border-(--color-border) px-1.5 py-0.5 font-mono">
          ⌘K
        </span>
      </div>
    </header>
  );
}
