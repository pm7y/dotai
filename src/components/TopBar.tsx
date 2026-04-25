import { useAtom } from "jotai";
import { ChevronDown, FolderOpen, Search, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { projectsAtom, type Project } from "@/state/projects";
import { projectAtom } from "@/state/selection";
import { loadProjects, saveProjects } from "@/lib/projects-store";
import { SearchPanel } from "@/components/SearchPanel";
import { ProjectsPanel } from "@/components/ProjectsPanel";

export function TopBar() {
  const [projects, setProjects] = useAtom(projectsAtom);
  const [project, setProject] = useAtom(projectAtom);
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const current = projects.find((p) => p.path === project) ?? null;

  // load persisted projects once on mount
  useEffect(() => {
    let cancelled = false;
    void loadProjects().then((loaded) => {
      if (cancelled || loaded.length === 0) return;
      setProjects(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [setProjects]);

  // global Cmd/Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function pickProject() {
    const picked = await openFolderDialog({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    const name = picked.split(/[\\/]/).filter(Boolean).pop() ?? picked;
    const next: Project = { id: picked, name, path: picked };
    const updated = projects.find((p) => p.path === picked)
      ? projects
      : [...projects, next];
    setProjects(updated);
    void saveProjects(updated);
    setProject(picked);
    setOpen(false);
  }

  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-bg-subtle) px-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold tracking-tight">dotai</span>
        <span className="text-[11px] text-(--color-fg-muted)">v0.1.0</span>
      </div>
      <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setProjectsOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-(--color-fg-muted) hover:bg-(--color-bg-muted)"
              >
                <Settings size={12} />
                Manage projects…
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
      </div>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex items-center gap-2 rounded border border-(--color-border) px-2 py-1 text-[11px] text-(--color-fg-muted) hover:bg-(--color-bg-muted)"
      >
        <Search size={12} />
        <span>Search</span>
        <span className="rounded border border-(--color-border) px-1.5 py-0.5 font-mono">
          ⌘K
        </span>
      </button>
      {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
      {projectsOpen && <ProjectsPanel onClose={() => setProjectsOpen(false)} />}
    </header>
  );
}
