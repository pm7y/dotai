import { useAtom, useAtomValue } from "jotai";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { entryById } from "@/catalog";
import { selectionAtom } from "@/state/selection";
import { buffersAtom } from "@/state/buffers";
import { readFile } from "@/lib/tauri";
import { openDocs } from "@/lib/docs-links";
import { EnvVarsPanel } from "@/components/EnvVarsPanel";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

function languageExtension(language: string): Extension[] {
  switch (language) {
    case "json":
    case "jsonc":
      return [json()];
    case "markdown":
      return [markdown()];
    default:
      return [];
  }
}

export function Editor() {
  const selection = useAtomValue(selectionAtom);
  const [buffers, setBuffers] = useAtom(buffersAtom);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });

  const entry = selection.entryId ? entryById(selection.entryId) : null;
  const isEnv = entry?.kind === "env";
  const filePath = isEnv ? null : selection.filePath;
  const buffer = filePath ? buffers[filePath] : null;

  const extensions = useMemo<Extension[]>(() => {
    if (!entry) return [];
    return [
      basicSetup,
      ...languageExtension(entry.language),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
    ];
  }, [entry]);

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

  useEffect(() => {
    if (!containerRef.current || isEnv || !buffer) return;
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
    const state = EditorState.create({
      doc: buffer.currentContent,
      extensions,
    });
    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [buffer, extensions, isEnv]);

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
          <span className="text-[13px] font-medium">{entry.label}</span>
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
