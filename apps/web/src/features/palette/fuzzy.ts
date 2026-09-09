/**
 * The palette's matcher: a deterministic fuzzy subsequence score, written here
 * rather than taken from cmdk's own filter because the palette ranks four
 * different kinds of thing against each other — commands, tasks, projects and
 * how recently a command was used — and a scorer it cannot see inside cannot be
 * tuned or tested.
 *
 * Deliberately greedy and left-to-right: it is not the optimal alignment, it is
 * the one a person predicts. Typing more characters always narrows the list,
 * and the same query always produces the same order.
 */

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
 * score where bigger is better. An empty query matches everything at 0, which
 * is what makes the unfiltered list fall back to its declared order.
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

/**
 * The best score across several strings — a command's label and its keywords, a
 * task's title and its project's name. A keyword match is worth slightly less
 * than a label match, so "Go to Today" beats a task that merely mentions today.
 */
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

/**
 * Case-folded and stripped of diacritics, so "Ecole" finds "École" and the
 * matcher behaves the same for every alphabet the product accepts. `NFKD` first
 * because the accent has to become its own code point before it can be removed.
 */
function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
