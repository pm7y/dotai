import type { RemotePath } from "../types";

export function joinRemote(...parts: string[]): RemotePath {
  for (const p of parts) {
    if (!p || p === "." || p === "..") {
      throw new Error(`joinRemote: invalid segment "${p}"`);
    }
  }
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter((p) => p.length > 0)
    .join("/");
}
