// Deterministic greedy left-to-right subsequence scorer, kept in-house (not
// cmdk's filter) so commands, tasks, projects and recency can be ranked together.

/** Word starts, so "wg" finds "Weekly Goal" and "#dw" finds "#deep-work". */
const BOUNDARY = /[\s\-_/#.:]/u;

const BASE = 2;
const CONSECUTIVE = 6;
const WORD_START = 8;
const CONTIGUOUS = 25;
const PREFIX = 20;
/** Long titles should not out-score short ones on the same evidence. */
const LENGTH_PENALTY = 0.08;

/**
 * `null` when `text` does not contain `query` as a subsequence; otherwise a
 * score where bigger is better. An empty query matches everything at 0.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const needle = fold(query);
  const haystack = fold(text);
  if (needle === "") return 0;
  if (haystack === "") return null;

  let score = 0;
  let cursor = 0;
  let previousMatch = -1;

  for (const character of needle) {
    const found = haystack.indexOf(character, cursor);
    if (found === -1) return null;

    score += BASE;
    if (found === previousMatch + 1) score += CONSECUTIVE;
    if (found === 0 || BOUNDARY.test(haystack[found - 1] ?? "")) score += WORD_START;

    previousMatch = found;
    cursor = found + 1;
  }

  const contiguous = haystack.indexOf(needle);
  if (contiguous === 0) score += PREFIX + CONTIGUOUS;
  else if (contiguous > 0) {
    score += CONTIGUOUS;
    if (BOUNDARY.test(haystack[contiguous - 1] ?? "")) score += WORD_START;
  }

  return score - haystack.length * LENGTH_PENALTY;
}

/** Best score across `primary` and `secondary`; a secondary match is discounted. */
export function fuzzyScoreAny(
  query: string,
  primary: string,
  secondary: readonly string[] = [],
): number | null {
  const best = fuzzyScore(query, primary);
  let result = best;

  for (const candidate of secondary) {
    const score = fuzzyScore(query, candidate);
    if (score === null) continue;
    const discounted = score - 10;
    if (result === null || discounted > result) result = discounted;
  }

  return result;
}

// Case-folded and stripped of diacritics; NFKD first so the accent is its own
// code point before it is removed.
function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
