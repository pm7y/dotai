import { useAtom, useAtomValue } from "jotai";
import { File, FilePlus, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CATEGORY_LABELS,
  entriesForToolScope,
  entryById,
  type CatalogEntry,
} from "@/catalog";
import { selectionAtom, projectAtom } from "@/state/selection";
import { listDir, resolvePath, statPath, writeFile } from "@/lib/tauri";
import { cn } from "@/lib/cn";
import { formatBytes, formatRelativeTime } from "@/lib/format";

type ListItem = {
  entry: CatalogEntry;
  absPath: string;
  exists: boolean;
  isDir: boolean;
  sizeBytes?: number | null;
  mtimeMs?: number | null;
  childName?: string;
};

type Candidate = {
  entry: CatalogEntry;
  absPath: string;
  isDir: boolean;
};

export function FileList() {
  const [selection, setSelection] = useAtom(selectionAtom);
  const project = useAtomValue(projectAtom);
  const [items, setItems] = useState<ListItem[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const isProjectScope =
    selection.scope === "project" || selection.scope === "project-local";
  const needsProject = isProjectScope && !project;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selection.tool || needsProject) {
        setItems([]);
        setCandidates([]);
        return;
      }
      const entry = selection.entryId ? entryById(selection.entryId) : null;
      const cat = entry?.category;
      const scopes: Array<"user" | "project" | "project-local"> =
        selection.scope === "user" || !selection.scope
          ? ["user"]
          : ["project", "project-local"];
      const entries = scopes
        .flatMap((s) => entriesForToolScope(selection.tool!, s))
        .filter((e) => (cat ? e.category === cat : true));
      setLoading(true);
      setError(null);
      try {
        const found: ListItem[] = [];
        const cands: Candidate[] = [];
        for (const e of entries) {
          if (e.kind === "env") {
            found.push({
              entry: e,
              absPath: "",
              exists: true,
              isDir: false,
            });
            continue;
          }
          let absPath = "";
          try {
            absPath = await resolvePath(e.pathTemplate, project ?? null);
          } catch {
            continue;
          }
          if (e.kind === "file") {
            const meta = await statPath(absPath);
            if (meta.exists) {
              found.push({
                entry: e,
                absPath,
                exists: true,
                isDir: meta.isDir,
                sizeBytes: meta.sizeBytes,
                mtimeMs: meta.mtimeMs,
              });
            } else {
              cands.push({ entry: e, absPath, isDir: false });
            }
          } else if (e.kind === "dir-of-files") {
            const children = await listDir(absPath, e.fileGlob);
            const fileChildren = children.filter((c) => !c.isDir);
            for (const child of fileChildren) {
              found.push({
                entry: e,
                absPath: child.absPath,
                exists: true,
                isDir: false,
                sizeBytes: child.sizeBytes,
                mtimeMs: child.mtimeMs,
                childName: child.name,
              });
            }
            if (fileChildren.length === 0) {
              cands.push({ entry: e, absPath, isDir: true });
            }
          }
        }
        if (!cancelled) {
          setItems(found);
          setCandidates(cands);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    selection.tool,
    selection.scope,
    selection.entryId,
    project,
    needsProject,
    reloadKey,
  ]);

  async function createFile(c: Candidate) {
    if (c.isDir) return;
    try {
      const initial = c.entry.language === "json" ? "{}\n" : "";
      await writeFile({ path: c.absPath, content: initial });
      setSelection({
        ...selection,
        entryId: c.entry.id,
        filePath: c.absPath,
      });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section
      className="flex w-72 shrink-0 flex-col border-r border-(--color-border) bg-(--color-bg)"
      aria-label="Files"
    >
      <header className="flex items-baseline justify-between border-b border-(--color-border) px-3 py-2 text-xs font-medium text-(--color-fg-muted)">
        <span>
          {selection.entryId
            ? CATEGORY_LABELS[entryById(selection.entryId)?.category ?? "settings"]
            : "Files"}
        </span>
        {!loading && items.length > 0 && (
          <span className="text-[10px]">
            {items.length} {items.length === 1 ? "file" : "files"}
          </span>
        )}
      </header>
      {needsProject && (
        <p className="p-3 text-xs text-(--color-fg-muted)">
          Pick a project from the top bar to see project-scoped files.
        </p>
      )}
      {!needsProject && loading && (
        <p className="p-3 text-xs text-(--color-fg-muted)">Loading…</p>
      )}
      {error && <p className="p-3 text-xs text-(--color-danger)">Error: {error}</p>}

      {!needsProject && !loading && items.length > 0 && (
        <ul className="flex-1 overflow-y-auto">
          {items.map((item, idx) => {
            const isSelected = selection.filePath === item.absPath;
            const label = item.childName ?? item.entry.label;
            return (
              <li key={`${item.entry.id}:${item.absPath || idx}`}>
                <button
                  type="button"
                  onClick={() =>
                    setSelection({
                      ...selection,
                      entryId: item.entry.id,
                      filePath: item.entry.kind === "env" ? null : item.absPath,
                    })
                  }
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-(--color-border)/40 px-3 py-2 text-left hover:bg-(--color-bg-muted)",
                    isSelected && "bg-(--color-accent)/10",
                  )}
                >
                  {item.entry.kind === "env" ? (
                    <Folder size={14} className="mt-0.5 shrink-0" />
                  ) : (
                    <File size={14} className="mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 truncate">
                    <div className="truncate text-[13px]">{label}</div>
                    <div className="truncate text-[11px] text-(--color-fg-muted)">
                      {item.entry.kind === "env"
                        ? `${item.entry.envVars?.length ?? 0} variables`
                        : `${formatBytes(item.sizeBytes ?? 0)} · ${formatRelativeTime(item.mtimeMs)}`}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!needsProject && !loading && items.length === 0 && candidates.length > 0 && (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-xs text-(--color-fg-muted)">
            No files yet. Possible locations:
          </p>
          <ul className="space-y-1.5">
            {candidates.map((c, idx) => (
              <li
                key={`${c.entry.id}:${c.absPath || idx}`}
                className="flex items-start justify-between gap-2 rounded border border-(--color-border) bg-(--color-bg-subtle) px-2 py-1.5"
              >
                <div className="flex-1 truncate">
                  <div className="truncate text-[12px]">{c.entry.label}</div>
                  <div className="truncate font-mono text-[10px] text-(--color-fg-muted)">
                    {c.absPath}
                  </div>
                </div>
                {!c.isDir && (
                  <button
                    type="button"
                    onClick={() => void createFile(c)}
                    className="flex shrink-0 items-center gap-1 rounded border border-(--color-border) px-1.5 py-0.5 text-[10px] hover:bg-(--color-bg-muted)"
                    title="Create empty file here"
                  >
                    <FilePlus size={10} />
                    Create
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!needsProject && !loading && items.length === 0 && candidates.length === 0 && (
        <p className="p-3 text-xs text-(--color-fg-muted)">
          No files for this category.
        </p>
      )}
    </section>
  );
}
