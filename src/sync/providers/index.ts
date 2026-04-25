import type { LocalIO, ProviderConfig, SyncProvider } from "../types";
import { FilesystemProvider } from "./filesystem";

export function createProvider(config: ProviderConfig, io: LocalIO): SyncProvider {
  switch (config.kind) {
    case "filesystem":
      return new FilesystemProvider(config, io);
    default: {
      const exhaustive: never = config.kind;
      throw new Error(`unknown provider kind: ${String(exhaustive)}`);
    }
  }
}
