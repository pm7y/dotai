import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { projectsAtom, type Project } from "@/state/projects";
import { scanProjects, type ScanResult } from "@/lib/tauri";
import { saveProjects } from "@/lib/projects-store";

type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "done"; results: ScanResult[] }
  | { status: "error"; message: string };

export function ProjectsPanel({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useAtom(projectsAtom);
  const [scanRoot, setScanRoot] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ status: "idle" });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function persist(next: Project[]) {
    setProjects(next);
    try {
      await saveProjects(next);
    } catch {
      // silent — projects still in-memory
    }
  }

  async function pickProject() {
    const picked = await openFolderDialog({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    const name = picked.split(/[\\/]/).filter(Boolean).pop() ?? picked;
    if (projects.find((p) => p.path === picked)) return;
    await persist([...projects, { id: picked, name, path: picked }]);
  }

  async function pickScanRoot() {
    const picked = await openFolderDialog({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    setScanRoot(picked);
    setScanState({ status: "scanning" });
    try {
      const results = await scanProjects({ root: picked, maxDepth: 3 });
      setScanState({ status: "done", results });
    } catch (e) {
      setScanState({ status: "error", message: String(e) });
    }
  }

  async function pinResult(path: string) {
    if (projects.find((p) => p.path === path)) return;
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
    await persist([...projects, { id: path, name, path }]);
  }

  async function remove(id: string) {
    await persist(projects.filter((p) => p.id !== id));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-w-[90vw] overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg) shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
          <h2 className="text-sm font-semibold">Projects</h2>
          <button
            type="button"
            onClick={pickProject}
            className="flex items-center gap-1 rounded bg-(--color-accent) px-2 py-1 text-[12px] text-(--color-accent-fg) hover:opacity-90"
          >
            <Plus size={12} /> Add project
          </button>
        </header>
        <section className="border-b border-(--color-border) px-4 py-3">
          <h3 className="mb-2 text-xs font-medium text-(--color-fg-muted)">Pinned</h3>
          {projects.length === 0 ? (
            <p className="text-xs text-(--color-fg-muted)">No projects added yet.</p>
          ) : (
            <ul className="space-y-1">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded px-2 py-1 hover:bg-(--color-bg-muted)"
                >
                  <div className="flex flex-col">
                    <span className="text-[13px]">{p.name}</span>
                    <span className="truncate text-[11px] text-(--color-fg-muted)">
                      {p.path}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="rounded p-1 text-(--color-fg-muted) hover:bg-(--color-bg-muted) hover:text-(--color-danger)"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-(--color-fg-muted)">Auto-scan</h3>
            <button
              type="button"
              onClick={pickScanRoot}
              className="flex items-center gap-1 rounded border border-(--color-border) px-2 py-1 text-[12px] hover:bg-(--color-bg-muted)"
            >
              <FolderOpen size={12} /> Pick root…
            </button>
          </div>
          {scanRoot && (
            <p className="mb-2 truncate text-[11px] text-(--color-fg-muted)">
              Scanning: {scanRoot}
            </p>
          )}
          {scanState.status === "scanning" && (
            <p className="text-xs text-(--color-fg-muted)">Scanning…</p>
          )}
          {scanState.status === "error" && (
            <p className="text-xs text-(--color-danger)">Error: {scanState.message}</p>
          )}
          {scanState.status === "done" && scanState.results.length === 0 && (
            <p className="text-xs text-(--color-fg-muted)">
              No candidate projects found.
            </p>
          )}
          {scanState.status === "done" && scanState.results.length > 0 && (
            <ul className="space-y-1">
              {scanState.results.map((r) => {
                const pinned = !!projects.find((p) => p.path === r.path);
                return (
                  <li
                    key={r.path}
                    className="flex items-center justify-between rounded px-2 py-1 hover:bg-(--color-bg-muted)"
                  >
                    <div className="flex flex-col">
                      <span className="truncate text-[12px]">{r.path}</span>
                      <span className="text-[10px] text-(--color-fg-muted)">
                        {r.matches.join(", ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={pinned}
                      onClick={() => void pinResult(r.path)}
                      className="rounded border border-(--color-border) px-2 py-0.5 text-[11px] hover:bg-(--color-bg-muted) disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {pinned ? "Pinned" : "Pin"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
