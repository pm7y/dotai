import { LazyStore } from "@tauri-apps/plugin-store";
import type { Project } from "@/state/projects";

const store = new LazyStore("projects.json");
const KEY = "projects";

export async function loadProjects(): Promise<Project[]> {
  try {
    const value = await store.get<Project[]>(KEY);
    return value ?? [];
  } catch {
    return [];
  }
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await store.set(KEY, projects);
  await store.save();
}
