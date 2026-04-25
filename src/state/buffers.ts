import { atom } from "jotai";

export type Buffer = {
  filePath: string;
  originalContent: string;
  currentContent: string;
  dirty: boolean;
  lineEnding: "lf" | "crlf";
  mode?: number | null;
  externalMtimeMs?: number | null;
};

export const buffersAtom = atom<Record<string, Buffer>>({});
