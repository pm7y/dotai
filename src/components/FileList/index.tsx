import { useAtom, useAtomValue } from "jotai";
import { File, FileWarning, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CATEGORY_LABELS,
  entriesForToolScope,
  entryById,
  type CatalogEntry,
} from "@/catalog";
import { selectionAtom } from "@/state/selection";
import { projectAtom } from "@/state/selection";
import { listDir, resolvePath, statPath } from "@/lib/tauri";
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

export function FileList() {
  const [selection, setSelection] = useAtom(selectionAtom);
  const project = useAtomValue(projectAtom);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProjectScope =
    selection.scope === "project" || selection.scope === "project-local";
  const needsProject = isProjectScope && !project;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selection.tool) {
        setItems([]);
        return;
      }
      if (needsProject) {
        setItems([]);
        return;
      }
      const entry = selection.entryId ? entryById(selection.entryId) : null;
      const cat = entry?.category;
      // For project-scope categories, surface both "project" and "project-local"
      // so e.g. clicking "Settings" lists both settings.json and settings.local.json.
      const scopes: Array<"user" | "project" | "project-local"> =
        selection.scope === "user" || !selection.scope
          ? ["user"]
          : ["project", "project-local"];
      const candidates = scopes
        .flatMap((s) => entriesForToolScope(selection.tool!, s))
        .filter((e) => (cat ? e.category === cat : true));
      setLoading(true);
      setError(null);
      try {
        const collected: ListItem[] = [];
        for (const e of candidates) {
          if (e.kind === "env") {
            collected.push({
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
            collected.push({
              entry: e,
              absPath,
              exists: meta.exists,
              isDir: meta.isDir,
              sizeBytes: meta.sizeBytes,
              mtimeMs: meta.mtimeMs,
            });
          } else if (e.kind === "dir-of-files") {
            const children = await listDir(absPath, e.fileGlob);
            for (const child of children) {
              if (child.isDir) continue;
              collected.push({
                entry: e,
                absPath: child.absPath,
                exists: true,
                isDir: false,
                sizeBytes: child.sizeBytes,
                mtimeMs: child.mtimeMs,
                childName: child.name,
              });
            }
          }
        }
        // Hide "not present" file entries when at least one real file exists
        // for the same category — too noisy otherwise.
        const hasReal = collected.some((c) => c.exists);
        const filtered = hasReal ? collected.filter((c) => c.exists) : collected;
        if (!cancelled) setItems(filtered);
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
  }, [selection.tool, selection.scope, selection.entryId, project, needsProject]);

  return (
    <section
      className="flex w-72 shrink-0 flex-col border-r border-(--color-border) bg-(--color-bg)"
      aria-label="Files"
    >
      <header className="border-b border-(--color-border) px-3 py-2 text-xs font-medium text-(--color-fg-muted)">
        {selection.entryId
          ? CATEGORY_LABELS[entryById(selection.entryId)?.category ?? "settings"]
          : "Files"}
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
      {!needsProject && !loading && items.length === 0 && (
        <p className="p-3 text-xs text-(--color-fg-muted)">
          No files for this category.
        </p>
      )}
      <ul className="flex-1 overflow-y-auto">
        {items.map((item, idx) => {
          const isSelected = selection.filePath === item.absPath;
          const label = item.childName ?? item.entry.label;
          return (
            <li key={`${item.entry.id}:${item.absPath || idx}`}>
              <button
                type="button"
                onClick={() => {
                  if (!item.exists && item.entry.kind !== "env") return;
                  setSelection({
                    ...selection,
                    entryId: item.entry.id,
                    filePath: item.entry.kind === "env" ? null : item.absPath,
                  });
                }}
                className={cn(
                  "flex w-full items-start gap-2 border-b border-(--color-border)/40 px-3 py-2 text-left hover:bg-(--color-bg-muted)",
                  isSelected && "bg-(--color-accent)/10",
                  !item.exists && "opacity-50",
                )}
              >
                {item.entry.kind === "env" ? (
                  <Folder size={14} className="mt-0.5 shrink-0" />
                ) : item.exists ? (
                  <File size={14} className="mt-0.5 shrink-0" />
                ) : (
                  <FileWarning
                    size={14}
                    className="mt-0.5 shrink-0 text-(--color-warn)"
                  />
                )}
                <div className="flex-1 truncate">
                  <div className="truncate text-[13px]">{label}</div>
                  <div className="truncate text-[11px] text-(--color-fg-muted)">
                    {item.entry.kind === "env"
                      ? `${item.entry.envVars?.length ?? 0} variables`
                      : item.exists
                        ? `${formatBytes(item.sizeBytes ?? 0)} · ${formatRelativeTime(item.mtimeMs)}`
                        : "not present"}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
