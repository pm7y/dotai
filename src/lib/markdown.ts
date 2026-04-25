const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?/;

export function stripFrontmatter(source: string): string {
  return source.replace(FRONTMATTER_RE, "");
}

const ABSOLUTE_URL_RE = /^(https?:|mailto:)/i;

export function isAbsoluteUrl(href: string | undefined): boolean {
  if (!href) return false;
  return ABSOLUTE_URL_RE.test(href);
}
