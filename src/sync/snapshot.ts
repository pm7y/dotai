import type { CatalogEntry } from "@/catalog";
import type { Project } from "@/state/projects";
import { eligibleEntries } from "./exclusions";
import { sha256Hex } from "./manifest";
import { joinRemote } from "./providers/types";
import { slugify } from "./slugify";
import type { LocalIO, SnapshotFileEntry } from "./types";

export type SnapshotFileBlob = {
  remotePath: string; // relative to the machine folder, i.e. "files/<entryId>/..."
  content: string;
  entryId: string;
};

export type CollectedSnapshot = {
  files: SnapshotFileBlob[];
  manifestFiles: SnapshotFileEntry[];
};

export async function collectSnapshot(args: {
  io: LocalIO;
  projects: Project[];
}): Promise<CollectedSnapshot> {
  const out: SnapshotFileBlob[] = [];
  const manifestFiles: SnapshotFileEntry[] = [];

  for (const entry of eligibleEntries()) {
    if (entry.scope === "project") {
      for (const project of args.projects) {
        await collectForResolved(entry, project, args.io, out, manifestFiles);
      }
    } else {
      await collectForResolved(entry, null, args.io, out, manifestFiles);
    }
  }

  return { files: out, manifestFiles };
}

async function collectForResolved(
  entry: CatalogEntry,
  project: Project | null,
  io: LocalIO,
  out: SnapshotFileBlob[],
  manifestFiles: SnapshotFileEntry[],
): Promise<void> {
  const absPath = await io.resolvePath(entry.pathTemplate, project?.path ?? null);
  const projectSlug = project ? slugify(project.name) : undefined;

  if (entry.kind === "file") {
    await tryCollectFile(entry, absPath, "", project, projectSlug, io, out, manifestFiles);
    return;
  }

  if (entry.kind === "dir-of-files") {
    const glob = entry.fileGlob ?? "*";
    const stat = await io.statPath(absPath);
    if (!stat.exists) return;
    const dirEntries = await io.listDir(absPath, glob);
    for (const de of dirEntries) {
      if (de.isDir) continue;
      await tryCollectFile(
        entry,
        de.absPath,
        de.name,
        project,
        projectSlug,
        io,
        out,
        manifestFiles,
      );
    }
    return;
  }
  // env entries are filtered upstream by eligibleEntries(); ignore other kinds.
}

async function tryCollectFile(
  entry: CatalogEntry,
  absPath: string,
  childName: string,
  project: Project | null,
  projectSlug: string | undefined,
  io: LocalIO,
  out: SnapshotFileBlob[],
  manifestFiles: SnapshotFileEntry[],
): Promise<void> {
  const stat = await io.statPath(absPath);
  if (!stat.exists || stat.isDir) return;

  const read = await io.readFile(absPath);

  // For kind:"file", relativePath is the basename. For dir-of-files, it's the entry's name (which may contain slashes for skills).
  const relativePath = entry.kind === "file" ? basename(absPath) : childName;

  const segments = ["files", entry.id];
  if (projectSlug) segments.push(projectSlug);
  segments.push(...relativePath.split("/"));
  const remotePath = joinRemote(...segments);

  out.push({ remotePath, content: read.content, entryId: entry.id });
  manifestFiles.push({
    entryId: entry.id,
    scope: entry.scope,
    projectSlug,
    projectAbsPath: project?.path,
    relativePath,
    sizeBytes: read.sizeBytes,
    sha256: await sha256Hex(read.content),
    sourceMtimeMs: read.mtimeMs ?? undefined,
  });
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}
