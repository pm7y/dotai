const MAX_LEN = 64;
const MAX_SUFFIX = 999;

export function slugify(input: string, taken?: ReadonlySet<string>): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks (NFKD decomposition residue)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = (normalized || "machine").slice(0, MAX_LEN);
  if (!taken || !taken.has(base)) return base;
  for (let i = 2; i <= MAX_SUFFIX; i += 1) {
    const suffix = `-${i}`;
    const candidate = base.slice(0, MAX_LEN - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(
    `slugify: cannot deduplicate "${input}" \u2014 all suffixes -2 through -${MAX_SUFFIX} are taken`,
  );
}
