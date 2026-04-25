import { open } from "@tauri-apps/plugin-dialog";
import { hostname, platform } from "@tauri-apps/plugin-os";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { tauriLocalIO } from "@/lib/local-io";
import { loadSyncSettings, saveSyncSettings } from "@/lib/sync-store";
import { projectsAtom } from "@/state/projects";
import { pushStateAtom, syncSettingsAtom } from "@/state/sync";
import {
  collectSnapshot,
  createProvider,
  pushSnapshot,
  slugify,
} from "@/sync";

function toNodePlatform(p: string): "darwin" | "linux" | "win32" {
  if (p === "macos") return "darwin";
  if (p === "windows") return "win32";
  return "linux";
}

export function SyncSettingsPanel() {
  const [settings, setSettings] = useAtom(syncSettingsAtom);
  const [pushState, setPushState] = useAtom(pushStateAtom);
  const [projects] = useAtom(projectsAtom);
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    if (settings === null) {
      void loadSyncSettings().then(setSettings);
    }
  }, [settings, setSettings]);

  useEffect(() => {
    if (settings && labelDraft === "") setLabelDraft(settings.machineLabel);
  }, [settings, labelDraft]);

  if (settings === null) return <div className="p-4 text-sm">Loading…</div>;

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

  async function saveLabel() {
    const fallback = (await hostname()) ?? "machine";
    const slug = slugify(labelDraft || fallback);
    const next = { ...settings!, machineLabel: labelDraft, machineSlug: slug };
    setSettings(next);
    await saveSyncSettings(next);
  }

  async function pushNow() {
    if (!settings!.providerConfig || !settings!.machineSlug) return;
    setPushState({ status: "pushing", done: 0, total: 0 });
    try {
      const provider = createProvider(settings!.providerConfig, tauriLocalIO);
      const collected = await collectSnapshot({ io: tauriLocalIO, projects });
      const total = collected.files.length + 1;
      await pushSnapshot({
        provider,
        machineSlug: settings!.machineSlug,
        machineLabel: settings!.machineLabel,
        hostname: (await hostname()) ?? "unknown",
        platform: toNodePlatform(await platform()),
        dotaiVersion: "0.1.0",
        collected,
        onProgress: (done) => setPushState({ status: "pushing", done, total }),
      });
      const next = { ...settings!, lastPushedAtMs: Date.now() };
      setSettings(next);
      await saveSyncSettings(next);
      setPushState({ status: "idle" });
    } catch (err) {
      setPushState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ready =
    settings.providerConfig !== null && settings.machineSlug.length > 0;

  return (
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
        <div className="flex gap-2">
          <input
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            placeholder="e.g. Work laptop"
            className="flex-1 rounded border border-(--color-border) bg-(--color-bg-subtle) p-1"
          />
          <button
            type="button"
            onClick={saveLabel}
            className="rounded border border-(--color-border) px-2 py-1"
          >
            Save
          </button>
        </div>
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
  );
}
