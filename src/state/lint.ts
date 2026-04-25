import { atom } from "jotai";
import { entryById } from "@/catalog";
import { selectionAtom } from "./selection";
import { buffersAtom } from "./buffers";
import { runRules, type RuleFinding } from "@/lib/lint";

const EMPTY: RuleFinding[] = [];

export const diagnosticsAtom = atom<RuleFinding[]>((get) => {
  const selection = get(selectionAtom);
  if (!selection.entryId || !selection.filePath) return EMPTY;
  const entry = entryById(selection.entryId);
  if (!entry) return EMPTY;
  const buffers = get(buffersAtom);
  const buffer = buffers[selection.filePath];
  if (!buffer) return EMPTY;
  return runRules(entry, buffer.currentContent, selection.filePath);
});
