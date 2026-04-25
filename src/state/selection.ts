import { atom } from "jotai";
import type { ToolId, Scope } from "@/catalog";

export type Selection = {
  tool: ToolId | null;
  scope: Scope | null;
  entryId: string | null;
  filePath: string | null;
};

export const selectionAtom = atom<Selection>({
  tool: null,
  scope: null,
  entryId: null,
  filePath: null,
});

export const projectAtom = atom<string | null>(null);
