import type { CatalogEntry, Language } from "@/catalog";

export function languageFromExtension(ext: string): Language {
  switch (ext.toLowerCase()) {
    case ".md":
    case ".markdown":
      return "markdown";
    case ".json":
      return "json";
    case ".jsonc":
    case ".json5":
      return "jsonc";
    case ".toml":
      return "toml";
    default:
      // No syntax highlighting beyond basicSetup. We pick "markdown" because
      // the markdown plugin tolerates arbitrary text without breaking, and
      // most ad-hoc files we follow refs into are markdown anyway.
      return "markdown";
  }
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx < 0 ? path : path.slice(idx + 1);
}

function extname(path: string): string {
  const base = basename(path);
  const idx = base.lastIndexOf(".");
  return idx <= 0 ? "" : base.slice(idx);
}

export function entryForPath(absolutePath: string): CatalogEntry {
  return {
    id: `adhoc:${absolutePath}`,
    tool: "claude-code",
    scope: "user",
    category: "adhoc",
    label: basename(absolutePath),
    pathTemplate: absolutePath,
    kind: "file",
    language: languageFromExtension(extname(absolutePath)),
    docsUrl: "",
  };
}
