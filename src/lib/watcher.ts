import { startWatch, stopWatch, onWatchEvent } from "./tauri";

const WATCH_ID = "main";
let started = false;
const watchedDirs = new Set<string>();

export async function ensureWatcher(): Promise<void> {
  if (started) return;
  started = true;
  await startWatch({ watchId: WATCH_ID, paths: [], recursive: false });
}

function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : path;
}

export async function watchPath(path: string): Promise<void> {
  await ensureWatcher();
  const dir = dirOf(path);
  if (watchedDirs.has(dir)) return;
  watchedDirs.add(dir);
  await stopWatch(WATCH_ID);
  started = false;
  await startWatch({
    watchId: WATCH_ID,
    paths: Array.from(watchedDirs),
    recursive: false,
  });
  started = true;
}

export function isAlwaysPromptPath(path: string): boolean {
  return /[\\/]\.claude\.json$/.test(path);
}

export { onWatchEvent };
