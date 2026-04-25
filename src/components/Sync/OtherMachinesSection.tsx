import { useAtom } from "jotai";
import { useCallback } from "react";
import { tauriLocalIO } from "@/lib/local-io";
import {
  remoteFileViewAtom,
  remoteMachinesAtom,
  selectedRemoteMachineAtom,
  syncSettingsAtom,
} from "@/state/sync";
import { createProvider, listMachines, readRemoteFile } from "@/sync";

export function OtherMachinesSection() {
  const [settings] = useAtom(syncSettingsAtom);
  const [machines, setMachines] = useAtom(remoteMachinesAtom);
  const [selected, setSelected] = useAtom(selectedRemoteMachineAtom);
  const [, setFileView] = useAtom(remoteFileViewAtom);

  const refresh = useCallback(async () => {
    if (!settings?.providerConfig) return;
    setMachines({ status: "loading" });
    try {
      const provider = createProvider(settings.providerConfig, tauriLocalIO);
      const list = await listMachines(provider);
      setMachines({ status: "ready", machines: list });
    } catch (err) {
      setMachines({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [settings, setMachines]);

  if (!settings?.providerConfig) {
    return null; // section hidden until configured
  }

  async function openFile(machineId: string, relativePath: string, sha256: string) {
    setFileView({ status: "loading", machineId, relativePath });
    try {
      const provider = createProvider(settings!.providerConfig!, tauriLocalIO);
      const content = await readRemoteFile(provider, machineId, relativePath);
      setFileView({
        status: "ready",
        machineId,
        relativePath,
        content,
        manifestSha256: sha256,
      });
    } catch (err) {
      setFileView({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <section className="flex flex-col gap-2 p-2 text-sm">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold">Other machines</h3>
        <button type="button" onClick={refresh} className="text-xs underline">
          {machines.status === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {machines.status === "idle" && (
        <p className="text-xs text-(--color-fg-muted)">Click Refresh to load.</p>
      )}
      {machines.status === "error" && (
        <p className="text-(--color-danger)">{machines.message}</p>
      )}
      {machines.status === "ready" && machines.machines.length === 0 && (
        <p className="text-xs text-(--color-fg-muted)">No machines have pushed yet.</p>
      )}
      {machines.status === "ready" && (
        <ul className="flex flex-col gap-1">
          {machines.machines.map((m) => {
            const isSelected = selected === m.machineId;
            return (
              <li key={m.machineId}>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(isSelected ? null : m.machineId)
                  }
                  className="w-full text-left"
                >
                  <span className="font-medium">{m.machineLabel}</span>{" "}
                  <span className="text-xs text-(--color-fg-muted)">
                    {relativeTime(m.pushedAtMs)}
                  </span>
                </button>
                {isSelected && (
                  <ul className="ml-3 mt-1 flex flex-col gap-0.5">
                    {m.files.map((f) => (
                      <li
                        key={`${f.entryId}/${f.relativePath}/${f.projectSlug ?? ""}`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            openFile(
                              m.machineId,
                              fileRemotePath(f),
                              f.sha256,
                            )
                          }
                          className="text-left underline-offset-2 hover:underline"
                        >
                          {f.entryId}
                          {f.projectSlug ? `/${f.projectSlug}` : ""}/
                          {f.relativePath}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function fileRemotePath(f: {
  entryId: string;
  projectSlug?: string;
  relativePath: string;
}): string {
  const parts = ["files", f.entryId];
  if (f.projectSlug) parts.push(f.projectSlug);
  parts.push(...f.relativePath.split("/"));
  return parts.join("/");
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  return `${Math.round(hr / 24)} d ago`;
}
