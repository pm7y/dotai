import { getPathTokens } from "./tauri";

let cachedBackupDir: string | null = null;
const sessionBackedUp = new Set<string>();

export async function getSessionBackupDir(): Promise<string> {
  if (cachedBackupDir) return cachedBackupDir;
  const tokens = await getPathTokens();
  const sep = tokens.appLocalData.includes("\\") ? "\\" : "/";
  cachedBackupDir = `${tokens.appLocalData}${sep}backups`;
  return cachedBackupDir;
}

export function shouldBackupNow(filePath: string): boolean {
  if (sessionBackedUp.has(filePath)) return false;
  sessionBackedUp.add(filePath);
  return true;
}

export function isReadOnlyByPath(absPath: string): boolean {
  return /[\\/]\.claude[\\/]plugins[\\/]/.test(absPath);
}
