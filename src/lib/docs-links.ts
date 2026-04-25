import { openUrl } from "@tauri-apps/plugin-opener";

export async function openDocs(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch (err) {
    console.error("openDocs failed", err);
  }
}
