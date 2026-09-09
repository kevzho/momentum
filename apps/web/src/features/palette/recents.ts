// Per-browser command usage, kept in `localStorage` rather than the database.

export const RECENTS_KEY = "momentum.palette.recents";

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
 * Ranking bonus for a command's history: recency first, frequency second, both
 * bounded so history stays small next to a prefix match.
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

/** Reads the stored map; a disabled or corrupted store is "no history", never an error. */
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
    // A full or disabled store only costs the ordering.
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
