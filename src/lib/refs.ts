export type RefMatch = {
  start: number;
  end: number;
  raw: string;
};

// @-prefix: @ followed by one of the path anchors, then path chars.
// Anchors: $HOME, ${HOME}, ~, ., .., or a literal /.
// Stops at whitespace. Trailing .,;:) are stripped post-match.
const AT_REF_REGEX = /(?<![\\\w])@(\$HOME|\$\{HOME\}|~|\.|\.\.|)(\/[^\s`]*)/g;

const TRAILING_PUNCT = /[.,;:)]+$/;

export function parseRefs(text: string): RefMatch[] {
  const matches: RefMatch[] = [];
  for (const m of text.matchAll(AT_REF_REGEX)) {
    const start = m.index ?? 0;
    let raw = m[0];
    const trail = raw.match(TRAILING_PUNCT);
    if (trail) raw = raw.slice(0, raw.length - trail[0].length);
    matches.push({ start, end: start + raw.length, raw });
  }
  return matches;
}

export type ResolveContext = {
  home: string;
  contextDir: string | null;
};

// Normalises a posix-style path: collapses ., .., and double slashes.
// Always returns an absolute path (no trailing slash unless root).
function normalisePath(path: string): string {
  const parts = path.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0) out.pop();
      continue;
    }
    out.push(part);
  }
  return "/" + out.join("/");
}

export function resolveRefPath(raw: string, ctx: ResolveContext): string | null {
  let body = raw.startsWith("@") ? raw.slice(1) : raw;
  // Strip #fragment.
  const hash = body.indexOf("#");
  if (hash >= 0) body = body.slice(0, hash);

  if (body.startsWith("$HOME/")) {
    return normalisePath(ctx.home + "/" + body.slice("$HOME/".length));
  }
  if (body.startsWith("${HOME}/")) {
    return normalisePath(ctx.home + "/" + body.slice("${HOME}/".length));
  }
  if (body.startsWith("~/")) {
    return normalisePath(ctx.home + "/" + body.slice(2));
  }
  if (body.startsWith("/")) {
    return normalisePath(body);
  }
  if (body.startsWith("./") || body.startsWith("../")) {
    if (!ctx.contextDir) return null;
    return normalisePath(ctx.contextDir + "/" + body);
  }
  return null;
}

export type ResolvedRef = RefMatch & { absolutePath: string };

export function findRefs(text: string, ctx: ResolveContext): ResolvedRef[] {
  const out: ResolvedRef[] = [];
  for (const m of parseRefs(text)) {
    const abs = resolveRefPath(m.raw, ctx);
    if (abs !== null) out.push({ ...m, absolutePath: abs });
  }
  return out;
}
