import { open } from "@tauri-apps/plugin-dialog";
import { hostname, platform } from "@tauri-apps/plugin-os";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { tauriLocalIO } from "@/lib/local-io";
import {
  loadSyncSettings,
  saveSyncSettings,
  type SyncSettings,
} from "@/lib/sync-store";
import { projectsAtom } from "@/state/projects";
import { pushStateAtom, remoteMachinesAtom, syncSettingsAtom } from "@/state/sync";
import {
  collectSnapshot,
  createProvider,
  listMachines,
  pushSnapshot,
  slugify,
} from "@/sync";

function toNodePlatform(p: string): "darwin" | "linux" | "win32" {
  if (p === "macos") return "darwin";
  if (p === "windows") return "win32";
  return "linux";
}

export function SyncSettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useAtom(syncSettingsAtom);
  const [pushState, setPushState] = useAtom(pushStateAtom);
  const [projects] = useAtom(projectsAtom);
  const [remoteMachines, setRemoteMachines] = useAtom(remoteMachinesAtom);
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    if (settings === null) {
      void loadSyncSettings().then(setSettings);
    }
  }, [settings, setSettings]);

  useEffect(() => {
    if (settings && labelDraft === "") setLabelDraft(settings.machineLabel);
  }, [settings, labelDraft]);

  // Load remote machines once when the panel opens, so slug collision
  // detection has the set of taken slugs to work against.
  useEffect(() => {
    if (!settings?.providerConfig) return;
    if (remoteMachines.status !== "idle") return;
    setRemoteMachines({ status: "loading" });
    const provider = createProvider(settings.providerConfig, tauriLocalIO);
    listMachines(provider)
      .then((machines) => setRemoteMachines({ status: "ready", machines }))
      .catch((err) =>
        setRemoteMachines({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, [settings?.providerConfig, remoteMachines.status, setRemoteMachines]);

  const takenSlugs = useMemo(() => {
    if (remoteMachines.status !== "ready") return new Set<string>();
    const own = settings?.machineSlug ?? "";
    return new Set(
      remoteMachines.machines.map((m) => m.machineId).filter((s) => s !== own),
    );
  }, [remoteMachines, settings?.machineSlug]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (settings === null) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16"
        onClick={onClose}
      >
        <div
          className="w-[520px] max-w-[90vw] overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg) shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 text-sm">Loading…</div>
        </div>
      </div>
    );
  }

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    const next = {
      ...settings!,
      providerConfig: { kind: "filesystem" as const, rootPath: selected },
    };
    setSettings(next);
    await saveSyncSettings(next);
  }

  function updateLabel(value: string) {
    setLabelDraft(value);
    const slug = slugify(value || "machine", takenSlugs);
    const next = { ...settings!, machineLabel: value, machineSlug: slug };
    setSettings(next);
    void saveSyncSettings(next).catch(() => {
      // persistence failure is non-fatal for the UI; settings stay in-memory
    });
  }

  async function pushNow() {
    const start = settings;
    if (!start?.providerConfig || !start.machineSlug) return;
    setPushState({ status: "pushing", done: 0, total: 0 });
    try {
      const provider = createProvider(start.providerConfig, tauriLocalIO);
      const collected = await collectSnapshot({ io: tauriLocalIO, projects });
      const total = collected.files.length + 1;
      await pushSnapshot({
        provider,
        machineSlug: start.machineSlug,
        machineLabel: start.machineLabel,
        hostname: (await hostname()) ?? "unknown",
        platform: toNodePlatform(await platform()),
        dotaiVersion: "0.1.0",
        collected,
        onProgress: (done) => setPushState({ status: "pushing", done, total }),
      });
      // Merge onto the latest settings, not the snapshot from pushNow's start —
      // the user may have edited the label mid-push.
      let merged: SyncSettings | null = null;
      setSettings((prev) => {
        merged = prev ? { ...prev, lastPushedAtMs: Date.now() } : prev;
        return merged ?? prev;
      });
      if (merged) await saveSyncSettings(merged);
      setPushState({ status: "idle" });
    } catch (err) {
      setPushState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ready = settings.providerConfig !== null && settings.machineSlug.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[90vw] overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg) shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-4 p-4 text-sm">
          <h2 className="text-base font-semibold">Cloud Sync</h2>

          <div>
            <label className="mb-1 block text-(--color-fg-muted)">Provider</label>
            <select
              className="w-full rounded border border-(--color-border) bg-(--color-bg-subtle) p-1"
              value="filesystem"
              onChange={() => {
                /* only one option in v1 */
              }}
            >
              <option value="filesystem">Local folder</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-(--color-fg-muted)">Sync folder</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={settings.providerConfig?.rootPath ?? ""}
                placeholder="(none selected)"
                className="flex-1 rounded border border-(--color-border) bg-(--color-bg-subtle) p-1"
              />
              <button
                type="button"
                onClick={pickFolder}
                className="rounded border border-(--color-border) px-2 py-1"
              >
                Pick…
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-(--color-fg-muted)">This machine</label>
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => updateLabel(e.target.value)}
              placeholder="e.g. Work laptop"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              name="dotai-machine-label"
              className="w-full rounded border border-(--color-border) bg-(--color-bg-subtle) p-1"
            />
            {settings.machineSlug && (
              <p className="mt-1 text-xs text-(--color-fg-muted)">
                Folder slug: <code>{settings.machineSlug}</code>
              </p>
            )}
          </div>

          <div>
            <button
              type="button"
              disabled={!ready || pushState.status === "pushing"}
              onClick={pushNow}
              className="rounded bg-(--color-accent) px-3 py-1 text-(--color-accent-fg) disabled:opacity-50"
            >
              {pushState.status === "pushing"
                ? `Pushing ${pushState.done} / ${pushState.total}…`
                : "Push snapshot now"}
            </button>
            {pushState.status === "error" && (
              <p className="mt-1 text-(--color-danger)">{pushState.message}</p>
            )}
            {settings.lastPushedAtMs && pushState.status !== "pushing" && (
              <p className="mt-1 text-xs text-(--color-fg-muted)">
                Last pushed {new Date(settings.lastPushedAtMs).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
