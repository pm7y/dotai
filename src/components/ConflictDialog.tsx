import { useAtom } from "jotai";
import { useMemo } from "react";
import { conflictAtom } from "@/state/watcher";
import { buffersAtom } from "@/state/buffers";

export function ConflictDialog() {
  const [conflict, setConflict] = useAtom(conflictAtom);
  const [buffers, setBuffers] = useAtom(buffersAtom);
  const buffer = conflict ? buffers[conflict.filePath] : null;

  const diff = useMemo(() => {
    if (!conflict || !buffer) return null;
    return {
      mineLines: buffer.currentContent.split("\n").length,
      theirsLines: conflict.externalContent.split("\n").length,
    };
  }, [conflict, buffer]);

  if (!conflict || !buffer) return null;

  function keepMine() {
    if (!conflict || !buffer) return;
    setBuffers((prev) => {
      const existing = prev[conflict.filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [conflict.filePath]: {
          ...existing,
          externalMtimeMs: conflict.externalMtimeMs,
          dirty: existing.currentContent !== conflict.externalContent,
        },
      };
    });
    setConflict(null);
  }

  function reloadTheirs() {
    if (!conflict) return;
    setBuffers((prev) => {
      const existing = prev[conflict.filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [conflict.filePath]: {
          ...existing,
          originalContent: conflict.externalContent,
          currentContent: conflict.externalContent,
          dirty: false,
          externalMtimeMs: conflict.externalMtimeMs,
        },
      };
    });
    setConflict(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="w-[640px] max-w-[90vw] rounded-lg border border-(--color-border) bg-(--color-bg) shadow-2xl">
        <header className="border-b border-(--color-border) px-4 py-3">
          <h2 className="text-sm font-semibold">File changed on disk</h2>
          <p className="mt-1 truncate text-[11px] text-(--color-fg-muted)">
            {conflict.filePath}
          </p>
        </header>
        <div className="px-4 py-3 text-sm">
          <p className="mb-3">
            {conflict.alwaysPrompt
              ? "This file is rewritten by Claude Code while it's running. Choose how to resolve the conflict:"
              : "Another process modified this file while you were editing. Choose how to resolve the conflict:"}
          </p>
          {diff && (
            <ul className="mb-3 space-y-1 text-[12px] text-(--color-fg-muted)">
              <li>
                Your buffer: {diff.mineLines} lines{" "}
                {buffer.dirty && <span className="text-(--color-warn)">(unsaved)</span>}
              </li>
              <li>On disk: {diff.theirsLines} lines</li>
            </ul>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-(--color-border) px-4 py-3">
          <button
            type="button"
            onClick={keepMine}
            className="rounded border border-(--color-border) px-3 py-1.5 text-[12px] hover:bg-(--color-bg-muted)"
          >
            Keep mine
          </button>
          <button
            type="button"
            onClick={reloadTheirs}
            className="rounded bg-(--color-accent) px-3 py-1.5 text-[12px] text-(--color-accent-fg) hover:opacity-90"
          >
            Reload theirs
          </button>
        </footer>
      </div>
    </div>
  );
}
