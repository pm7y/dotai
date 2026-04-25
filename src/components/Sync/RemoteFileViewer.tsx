import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { sha256Hex } from "@/sync/manifest";
import { remoteFileViewAtom } from "@/state/sync";

export function RemoteFileViewer() {
  const [view] = useAtom(remoteFileViewAtom);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cmRef = useRef<EditorView | null>(null);
  const [integrity, setIntegrity] = useState<"unknown" | "ok" | "mismatch">("unknown");

  useEffect(() => {
    if (view.status !== "ready") return;
    if (!hostRef.current) return;
    cmRef.current?.destroy();
    cmRef.current = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: view.content,
        extensions: [EditorView.editable.of(false), EditorState.readOnly.of(true)],
      }),
    });
    setIntegrity("unknown");
    let cancelled = false;
    void sha256Hex(view.content).then((digest) => {
      if (cancelled) return;
      setIntegrity(digest === view.manifestSha256 ? "ok" : "mismatch");
    });
    return () => {
      cancelled = true;
      cmRef.current?.destroy();
      cmRef.current = null;
    };
  }, [view]);

  if (view.status === "idle") {
    return (
      <div className="p-4 text-sm text-(--color-fg-muted)">
        Select a file from another machine to view.
      </div>
    );
  }
  if (view.status === "loading") {
    return <div className="p-4 text-sm">Loading {view.relativePath}…</div>;
  }
  if (view.status === "error") {
    return <div className="p-4 text-(--color-danger)">{view.message}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-(--color-border) bg-(--color-bg-subtle) p-2 text-xs">
        Read-only — from machine <code>{view.machineId}</code>:{" "}
        <code>{view.relativePath}</code>
        {integrity === "mismatch" && (
          <span className="ml-2 text-(--color-danger)">
            ⚠ content changed since manifest was written
          </span>
        )}
      </div>
      <div ref={hostRef} className="flex-1 overflow-auto" />
    </div>
  );
}
