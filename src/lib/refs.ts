export type RefMatch = {
  start: number;
  end: number;
  raw: string;
};

export type ParseOptions = {
  detectBackticks: boolean;
};

// @-prefix: @ followed by one of the path anchors, then path chars.
// Anchors: $HOME, ${HOME}, ~, ., .., or a literal /.
// Stops at whitespace. Trailing .,;:) are stripped post-match.
const AT_REF_REGEX =
  /(?<![\\\w])@(\$HOME|\$\{HOME\}|~|\.|\.\.|)(\/[^\s`]*)/g;

const TRAILING_PUNCT = /[.,;:)]+$/;

// Backtick paths: a single-backtick span whose content starts with a
// known path anchor and contains a separator. The leading `/` case covers
// absolute paths like `/etc/hosts`.
const BACKTICK_REGEX =
  /`((?:~|\.{1,2}|\$HOME|\$\{HOME\}|(?=\/))\/[^`\n]*)`/g;

// Matches an opening or closing fenced-code-block line. Captures the fence
// for closing-pair matching (``` opens iff ``` closes; same for ~~~).
const FENCE_LINE = /^(```|~~~)/;

function rangesInsideFences(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let cursor = 0;
  let openFence: string | null = null;
  let openOffset = 0;
  for (const line of text.split("\n")) {
    const m = line.match(FENCE_LINE);
    if (m) {
      if (openFence === null) {
        openFence = m[1];
        openOffset = cursor;
      } else if (line.startsWith(openFence)) {
        ranges.push([openOffset, cursor + line.length]);
        openFence = null;
      }
    }
    cursor += line.length + 1; // +1 for the newline that split() consumed
  }
  if (openFence !== null) {
    ranges.push([openOffset, text.length]);
  }
  return ranges;
}

function isInside(ranges: Array<[number, number]>, pos: number): boolean {
  for (const [a, b] of ranges) {
    if (pos >= a && pos < b) return true;
  }
  return false;
}

export function parseRefs(text: string, opts: ParseOptions): RefMatch[] {
  const matches: RefMatch[] = [];
  const fences = opts.detectBackticks ? rangesInsideFences(text) : [];

  for (const m of text.matchAll(AT_REF_REGEX)) {
    const start = m.index ?? 0;
    let raw = m[0];
    // Strip trailing punctuation from the matched range.
    const trail = raw.match(TRAILING_PUNCT);
    if (trail) raw = raw.slice(0, raw.length - trail[0].length);
    matches.push({ start, end: start + raw.length, raw });
  }

  if (opts.detectBackticks) {
    for (const m of text.matchAll(BACKTICK_REGEX)) {
      const start = m.index ?? 0;
      if (isInside(fences, start)) continue;
      const raw = m[0];
      matches.push({ start, end: start + raw.length, raw });
    }
  }

  matches.sort((a, b) => a.start - b.start);
  return matches;
}
