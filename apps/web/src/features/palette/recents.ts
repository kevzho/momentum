/**
 * Which commands this person actually uses.
 *
 * "Recent/frequent commands surface first" (specs/11-command-palette.md), which
 * means the palette needs a memory. It is a per-browser preference, so it lives
 * in `localStorage` alongside the theme rather than in the database
 * (docs/ARCHITECTURE.md §7): losing it costs a slightly worse ordering for a
 * day, and syncing it would cost a write on every command.
 *
 * Everything here is a pure function of a map and a timestamp, so the ordering
 * is testable without a browser and without a clock.
 */

export const RECENTS_KEY = "momentum.palette.recents";

/** More than anyone reads before typing; enough that the ordering settles. */
const MAX_ENTRIES = 40;

export interface CommandUsage {
  uses: number;
  /** Epoch milliseconds. */
  lastUsedAt: number;
}

export type CommandUsageMap = Readonly<Record<string, CommandUsage>>;

export const NO_USAGE: CommandUsageMap = {};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * How much a command's history is worth when the list is ranked.
 *
 * Recency first, frequency second, and both bounded: a command used forty times
 * last month must not out-rank the one the user is typing the name of. The
 * bonus is small next to a prefix match for exactly that reason.
 */
export function usageBonus(usage: CommandUsage | undefined, now: number): number {
  if (usage === undefined) return 0;

  const age = Math.max(0, now - usage.lastUsedAt);
  const recency = age < HOUR ? 30 : age < DAY ? 20 : age < WEEK ? 10 : 4;
  const frequency = Math.min(usage.uses, 10) * 2;

  return recency + frequency;
}

/** Most recently used first, then most used, then by id so ties are stable. */
export function recentIds(usage: CommandUsageMap): string[] {
  return Object.entries(usage)
    .sort(
      ([leftId, left], [rightId, right]) =>
        right.lastUsedAt - left.lastUsedAt ||
        right.uses - left.uses ||
        leftId.localeCompare(rightId),
    )
    .map(([id]) => id);
}

export function recordUse(usage: CommandUsageMap, id: string, now: number): CommandUsageMap {
  const previous = usage[id];
  const next: Record<string, CommandUsage> = {
    ...usage,
    [id]: { uses: (previous?.uses ?? 0) + 1, lastUsedAt: now },
  };

  const ids = recentIds(next);
  if (ids.length <= MAX_ENTRIES) return next;

  for (const stale of ids.slice(MAX_ENTRIES)) delete next[stale];
  return next;
}

/**
 * Reads the stored map, treating anything unexpected as "no history".
 *
 * A quota-blocked, disabled or corrupted store must degrade to an unranked
 * palette, never to an error: the palette is the way to *reach* the rest of the
 * product, so it is the last thing that may fail to open.
 */
export function readUsage(storage: Pick<Storage, "getItem"> | undefined): CommandUsageMap {
  if (storage === undefined) return NO_USAGE;

  try {
    const raw = storage.getItem(RECENTS_KEY);
    if (raw === null) return NO_USAGE;
    return parseUsage(JSON.parse(raw));
  } catch {
    return NO_USAGE;
  }
}

export function writeUsage(
  storage: Pick<Storage, "setItem"> | undefined,
  usage: CommandUsageMap,
): void {
  if (storage === undefined) return;
  try {
    storage.setItem(RECENTS_KEY, JSON.stringify(usage));
  } catch {
    // A full or disabled store costs the ordering, nothing else.
  }
}

function parseUsage(value: unknown): CommandUsageMap {
  if (typeof value !== "object" || value === null) return NO_USAGE;

  const entries: Record<string, CommandUsage> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (typeof raw !== "object" || raw === null) continue;
    const { uses, lastUsedAt } = raw as Partial<CommandUsage>;
    if (typeof uses !== "number" || typeof lastUsedAt !== "number") continue;
    if (!Number.isFinite(uses) || !Number.isFinite(lastUsedAt)) continue;
    entries[id] = { uses, lastUsedAt };
  }
  return entries;
}
