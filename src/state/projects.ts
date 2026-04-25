import { atom } from "jotai";

export type Project = {
  id: string;
  name: string;
  path: string;
};

export const projectsAtom = atom<Project[]>([]);
