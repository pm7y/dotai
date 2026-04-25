import { useAtomValue, useSetAtom } from "jotai";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, entryById } from "@/catalog";
import { listDir, resolvePath, searchFiles, type SearchHit } from "@/lib/tauri";
import { selectionAtom, projectAtom } from "@/state/selection";
import { projectsAtom } from "@/state/projects";

type State =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "ready"; hits: SearchHit[] }
  | { status: "error"; message: string };

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const projects = useAtomValue(projectsAtom);
  const project = useAtomValue(projectAtom);
  const setSelection = useSetAtom(selectionAtom);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const projectPaths = useMemo(() => projects.map((p) => p.path), [projects]);

  async function collectPaths(): Promise<string[]> {
    const out: string[] = [];
    const candidateProjects = project ? [project] : projectPaths;
    for (const entry of CATALOG) {
      if (entry.kind === "env") continue;
      if (entry.scope === "user") {
        try {
          const abs = await resolvePath(entry.pathTemplate);
          if (entry.kind === "file") {
            out.push(abs);
          } else if (entry.kind === "dir-of-files") {
            const children = await listDir(abs, entry.fileGlob);
            for (const c of children) if (!c.isDir) out.push(c.absPath);
          }
        } catch {
          // skip
        }
      } else {
        for (const p of candidateProjects) {
          try {
            const abs = await resolvePath(entry.pathTemplate, p);
            if (entry.kind === "file") {
              out.push(abs);
            } else if (entry.kind === "dir-of-files") {
              const children = await listDir(abs, entry.fileGlob);
              for (const c of children) if (!c.isDir) out.push(c.absPath);
            }
          } catch {
            // skip
          }
        }
      }
    }
    return Array.from(new Set(out));
  }

  async function runSearch() {
    if (!query.trim()) return;
    setState({ status: "searching" });
    try {
      const paths = await collectPaths();
      const hits = await searchFiles({
        query,
        paths,
        caseInsensitive: true,
      });
      setState({ status: "ready", hits });
    } catch (e) {
      setState({ status: "error", message: String(e) });
    }
  }

  function pickHit(hit: SearchHit) {
    const matchedEntry = CATALOG.find((e) => {
      if (e.kind === "env") return false;
      if (e.kind === "file") {
        return hit.path.endsWith(e.pathTemplate.split("/").pop() ?? "");
      }
      return hit.path.includes(`${e.pathTemplate.split("/").pop()}`);
    });
    const fallback = entryById("cc.user.settings");
    const entry = matchedEntry ?? fallback;
    if (!entry) return;
    setSelection({
      tool: entry.tool,
      scope: entry.scope,
      entryId: entry.id,
      filePath: hit.path,
    });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
      onClick={onClose}
    >
      <div
        className="w-[720px] max-w-[90vw] overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg) shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-(--color-border) px-3 py-2">
          <Search size={14} className="text-(--color-fg-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder="Search across all configs (press Enter)…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-(--color-fg-muted)"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-(--color-fg-muted) hover:bg-(--color-bg-muted)"
          >
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {state.status === "searching" && (
            <p className="p-4 text-xs text-(--color-fg-muted)">Searching…</p>
          )}
          {state.status === "error" && (
            <p className="p-4 text-xs text-(--color-danger)">Error: {state.message}</p>
          )}
          {state.status === "ready" && state.hits.length === 0 && (
            <p className="p-4 text-xs text-(--color-fg-muted)">No matches.</p>
          )}
          {state.status === "ready" && state.hits.length > 0 && (
            <ul>
              {state.hits.slice(0, 200).map((hit, idx) => (
                <li key={`${hit.path}:${hit.line}:${idx}`}>
                  <button
                    type="button"
                    onClick={() => pickHit(hit)}
                    className="flex w-full flex-col items-start gap-0.5 border-b border-(--color-border)/40 px-3 py-2 text-left hover:bg-(--color-bg-muted)"
                  >
                    <span className="truncate text-[12px]">
                      {hit.path}
                      <span className="ml-2 text-[10px] text-(--color-fg-muted)">
                        :{hit.line}
                      </span>
                    </span>
                    <code className="truncate font-mono text-[11px] text-(--color-fg-muted)">
                      {hit.text}
                    </code>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {state.status === "ready" && state.hits.length > 200 && (
            <p className="px-3 py-2 text-[11px] text-(--color-fg-muted)">
              Showing first 200 of {state.hits.length} matches.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
