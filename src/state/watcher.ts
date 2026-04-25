import { atom } from "jotai";

export type Conflict = {
  filePath: string;
  externalContent: string;
  externalMtimeMs: number | null;
  alwaysPrompt: boolean;
};

export const conflictAtom = atom<Conflict | null>(null);
