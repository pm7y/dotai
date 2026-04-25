import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ExternalLink, Save, RotateCcw, Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { entryById } from "@/catalog";
import { selectionAtom } from "@/state/selection";
import { buffersAtom } from "@/state/buffers";
import { conflictAtom } from "@/state/watcher";
import { readFile, writeFile, onWatchEvent } from "@/lib/tauri";
import { openDocs } from "@/lib/docs-links";
import { getSessionBackupDir, isReadOnlyByPath, shouldBackupNow } from "@/lib/backup";
import { extensionsForEntry } from "@/lib/editor-extensions";
import { isAlwaysPromptPath, watchPath } from "@/lib/watcher";
import { EnvVarsPanel } from "@/components/EnvVarsPanel";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; message: string };

export function Editor() {
  const selection = useAtomValue(selectionAtom);
  const [buffers, setBuffers] = useAtom(buffersAtom);
  const setConflict = useSetAtom(conflictAtom);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const entry = selection.entryId ? entryById(selection.entryId) : null;
  const isEnv = entry?.kind === "env";
  const filePath = isEnv ? null : selection.filePath;
  const buffer = filePath ? buffers[filePath] : null;
  const isPluginReadOnly = filePath ? isReadOnlyByPath(filePath) : false;

  const save = useCallback(async () => {
    if (!filePath || !buffer || isPluginReadOnly) return;
    if (!buffer.dirty) return;
    setSaveState({ status: "saving" });
    try {
      const backupDir = shouldBackupNow(filePath) ? await getSessionBackupDir() : null;
      const result = await writeFile({
        path: filePath,
        content: buffer.currentContent,
        lineEnding: buffer.lineEnding,
        mode: buffer.mode ?? null,
        backupDir,
      });
      setBuffers((prev) => {
        const existing = prev[filePath];
        if (!existing) return prev;
        return {
          ...prev,
          [filePath]: {
            ...existing,
            originalContent: existing.currentContent,
            dirty: false,
            externalMtimeMs: result.mtimeMs ?? existing.externalMtimeMs,
          },
        };
      });
      setSaveState({ status: "saved", at: Date.now() });
    } catch (e) {
      setSaveState({ status: "error", message: String(e) });
    }
  }, [filePath, buffer, isPluginReadOnly, setBuffers]);

  const revert = useCallback(() => {
    if (!filePath || !buffer || !buffer.dirty) return;
    setBuffers((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          currentContent: existing.originalContent,
          dirty: false,
        },
      };
    });
    if (viewRef.current) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: buffer.originalContent,
        },
      });
    }
  }, [filePath, buffer, setBuffers]);

  const onChange = useCallback(
    (next: string) => {
      if (!filePath) return;
      setBuffers((prev) => {
        const existing = prev[filePath];
        if (!existing) return prev;
        if (existing.currentContent === next) return prev;
        return {
          ...prev,
          [filePath]: {
            ...existing,
            currentContent: next,
            dirty: next !== existing.originalContent,
          },
        };
      });
    },
    [filePath, setBuffers],
  );

  const editable = !!filePath && !isPluginReadOnly;

  const extensions = useMemo<Extension[]>(() => {
    if (!entry) return [];
    return [
      basicSetup,
      ...extensionsForEntry(entry),
      EditorState.readOnly.of(!editable),
      EditorView.editable.of(editable),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            void save();
            return true;
          },
        },
      ]),
    ];
  }, [entry, editable, onChange, save]);

  useEffect(() => {
    if (isEnv || !filePath || !entry) return;
    if (buffer) {
      setLoadState({ status: "ready" });
      return;
    }
    let cancelled = false;
    setLoadState({ status: "loading" });
    readFile(filePath)
      .then((res) => {
        if (cancelled) return;
        setBuffers((prev) => ({
          ...prev,
          [filePath]: {
            filePath,
            originalContent: res.content,
            currentContent: res.content,
            dirty: false,
            lineEnding: res.lineEnding,
            mode: res.mode,
            externalMtimeMs: res.mtimeMs,
          },
        }));
        setLoadState({ status: "ready" });
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadState({ status: "error", message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, isEnv, entry, buffer, setBuffers]);

  // Mount/unmount CodeMirror once per file. We deliberately depend on bufferReady
  // (not buffer) so we don't tear down on every keystroke. The buffer ref carries
  // the latest content into the mount effect without triggering re-mounts.
  const bufferReady = !!buffer;
  const bufferRef = useRef(buffer);
  useEffect(() => {
    bufferRef.current = buffer;
  }, [buffer]);
  useEffect(() => {
    if (!containerRef.current || isEnv || !filePath || !bufferReady) return;
    const initial = bufferRef.current?.currentContent ?? "";
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
    const state = EditorState.create({ doc: initial, extensions });
    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // extensions captures the current onChange/save refs at mount time —
    // we deliberately don't re-mount when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, isEnv, bufferReady]);

  // window-level Cmd+S as a backstop when the editor isn't focused
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // start watching the file's parent dir when opened
  useEffect(() => {
    if (!filePath || isEnv) return;
    void watchPath(filePath);
  }, [filePath, isEnv]);

  // listen for external changes
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void onWatchEvent((ev) => {
      for (const changedPath of ev.paths) {
        const target = buffers[changedPath];
        if (!target) continue;
        const isOurOwnSave = ev.kind.includes("Modify");
        void readFile(changedPath)
          .then((res) => {
            if (
              res.mtimeMs &&
              target.externalMtimeMs &&
              res.mtimeMs <= target.externalMtimeMs
            ) {
              return;
            }
            if (res.content === target.currentContent) {
              setBuffers((prev) => {
                const existing = prev[changedPath];
                if (!existing) return prev;
                return {
                  ...prev,
                  [changedPath]: {
                    ...existing,
                    externalMtimeMs: res.mtimeMs,
                  },
                };
              });
              return;
            }
            const alwaysPrompt = isAlwaysPromptPath(changedPath);
            if (target.dirty || alwaysPrompt) {
              setConflict({
                filePath: changedPath,
                externalContent: res.content,
                externalMtimeMs: res.mtimeMs ?? null,
                alwaysPrompt,
              });
              return;
            }
            setBuffers((prev) => {
              const existing = prev[changedPath];
              if (!existing) return prev;
              return {
                ...prev,
                [changedPath]: {
                  ...existing,
                  originalContent: res.content,
                  currentContent: res.content,
                  dirty: false,
                  externalMtimeMs: res.mtimeMs,
                },
              };
            });
            if (viewRef.current && filePath === changedPath) {
              viewRef.current.dispatch({
                changes: {
                  from: 0,
                  to: viewRef.current.state.doc.length,
                  insert: res.content,
                },
              });
            }
          })
          .catch(() => {
            // file may have been deleted; ignore
          });
        void isOurOwnSave;
      }
    }).then((un) => {
      unlisten = un;
    });
    return () => {
      unlisten?.();
    };
  }, [buffers, filePath, setBuffers, setConflict]);

  if (!entry) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-(--color-fg-muted)">
        Select a file to view.
      </main>
    );
  }

  const showEditor = !isEnv && filePath && buffer && loadState.status !== "loading";

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-bg-subtle) px-3 py-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium">{entry.label}</span>
            {buffer?.dirty && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-accent)"
                aria-label="unsaved changes"
                title="Unsaved changes"
              />
            )}
            {isPluginReadOnly && (
              <span className="flex items-center gap-1 rounded bg-(--color-bg-muted) px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-(--color-fg-muted)">
                <Lock size={10} /> read-only
              </span>
            )}
          </div>
          {filePath && (
            <span className="truncate text-[11px] text-(--color-fg-muted)">
              {filePath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-(--color-fg-muted)">
          <span className="rounded bg-(--color-bg-muted) px-2 py-0.5 font-mono uppercase">
            {entry.language}
          </span>
          {filePath && !isPluginReadOnly && (
            <>
              <button
                type="button"
                disabled={!buffer?.dirty}
                onClick={revert}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-(--color-bg-muted) disabled:cursor-not-allowed disabled:opacity-30"
                title="Revert"
              >
                <RotateCcw size={11} />
                Revert
              </button>
              <button
                type="button"
                disabled={!buffer?.dirty || saveState.status === "saving"}
                onClick={() => void save()}
                className="flex items-center gap-1 rounded bg-(--color-accent) px-2 py-0.5 text-(--color-accent-fg) hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                title="Save (⌘S)"
              >
                <Save size={11} />
                {saveState.status === "saving" ? "Saving…" : "Save"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => openDocs(entry.docsUrl)}
            className="flex items-center gap-1 text-(--color-accent) hover:underline"
          >
            Docs <ExternalLink size={11} />
          </button>
        </div>
      </header>
      {entry.notes && (
        <div className="border-b border-(--color-warn)/30 bg-(--color-warn)/10 px-3 py-1.5 text-[11px] text-(--color-fg)">
          {entry.notes}
        </div>
      )}
      {saveState.status === "error" && (
        <div className="border-b border-(--color-danger)/40 bg-(--color-danger)/10 px-3 py-1.5 text-[11px] text-(--color-danger)">
          Save failed: {saveState.message}
        </div>
      )}
      {isEnv ? (
        <EnvVarsPanel envVars={entry.envVars ?? []} />
      ) : !filePath ? (
        <p className="p-4 text-xs text-(--color-fg-muted)">
          Select a file from the list.
        </p>
      ) : loadState.status === "loading" ? (
        <p className="p-4 text-xs text-(--color-fg-muted)">Loading…</p>
      ) : loadState.status === "error" ? (
        <p className="p-4 text-xs text-(--color-danger)">Error: {loadState.message}</p>
      ) : null}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{ display: showEditor ? "block" : "none" }}
      />
    </main>
  );
}
