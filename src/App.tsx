import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { FileList } from "@/components/FileList";
import { Editor } from "@/components/Editor";
import { ConflictDialog } from "@/components/ConflictDialog";

export default function App() {
  return (
    <div className="flex h-full flex-col bg-(--color-bg) text-(--color-fg)">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <FileList />
        <Editor />
      </div>
      <ConflictDialog />
    </div>
  );
}
