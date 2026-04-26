import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { FileList } from "@/components/FileList";
import { Editor } from "@/components/Editor";
import { ConflictDialog } from "@/components/ConflictDialog";
import { RemoteFileViewer } from "@/components/Sync/RemoteFileViewer";
import { remoteFileViewAtom } from "@/state/sync";
import { homeDirAtom } from "@/state/selection";
import { getPathTokens } from "@/lib/tauri";

function MainPane() {
  const view = useAtomValue(remoteFileViewAtom);
  if (view.status === "idle") return <Editor />;
  return <RemoteFileViewer />;
}

export default function App() {
  const setHomeDir = useSetAtom(homeDirAtom);
  useEffect(() => {
    let cancelled = false;
    void getPathTokens().then((t) => {
      if (!cancelled) setHomeDir(t.home);
    });
    return () => {
      cancelled = true;
    };
  }, [setHomeDir]);

  return (
    <div className="flex h-full flex-col bg-(--color-bg) text-(--color-fg)">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <FileList />
        <MainPane />
      </div>
      <ConflictDialog />
    </div>
  );
}
