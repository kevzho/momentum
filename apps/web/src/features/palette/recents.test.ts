import { describe, expect, it } from "vitest";

import {
  NO_USAGE,
  RECENTS_KEY,
  readUsage,
  recentIds,
  recordUse,
  usageBonus,
  writeUsage,
  type CommandUsageMap,
} from "@/features/palette/recents";

/**
 * The ordering the spec asks for — "recent/frequent commands surface first" —
 * and the promise that it can never be the reason the palette fails to open.
 */

const NOW = 1_780_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("usageBonus", () => {
  it("is nothing for a command that has never been run", () => {
    expect(usageBonus(undefined, NOW)).toBe(0);
  });

  it("decays with age", () => {
    const minutesAgo = usageBonus({ uses: 1, lastUsedAt: NOW - 60_000 }, NOW);
    const yesterday = usageBonus({ uses: 1, lastUsedAt: NOW - 2 * DAY }, NOW);
    const lastMonth = usageBonus({ uses: 1, lastUsedAt: NOW - 40 * DAY }, NOW);
    expect(minutesAgo).toBeGreaterThan(yesterday);
    expect(yesterday).toBeGreaterThan(lastMonth);
  });

  it("rewards frequency, but bounded, so history cannot beat what is being typed", () => {
    const once = usageBonus({ uses: 1, lastUsedAt: NOW }, NOW);
    const often = usageBonus({ uses: 500, lastUsedAt: NOW }, NOW);
    expect(often).toBeGreaterThan(once);
    expect(often).toBeLessThan(60);
  });
});

describe("recordUse", () => {
  it("counts a first use and every one after it", () => {
    const first = recordUse(NO_USAGE, "tasks.create", NOW);
    expect(first["tasks.create"]).toEqual({ uses: 1, lastUsedAt: NOW });

    const second = recordUse(first, "tasks.create", NOW + HOUR);
    expect(second["tasks.create"]).toEqual({ uses: 2, lastUsedAt: NOW + HOUR });
  });

  it("does not mutate the map it was given", () => {
    const before: CommandUsageMap = { "tasks.create": { uses: 1, lastUsedAt: NOW } };
    recordUse(before, "tasks.create", NOW + HOUR);
    expect(before["tasks.create"]).toEqual({ uses: 1, lastUsedAt: NOW });
  });

  it("forgets the oldest once the store is full", () => {
    let usage: CommandUsageMap = NO_USAGE;
    for (let index = 0; index < 60; index += 1) {
      usage = recordUse(usage, `command.${index}`, NOW + index);
    }
    expect(Object.keys(usage)).toHaveLength(40);
    expect(usage["command.59"]).toBeDefined();
    expect(usage["command.0"]).toBeUndefined();
  });
});

describe("recentIds", () => {
  it("is most recent first, then most used, then stable", () => {
    const usage: CommandUsageMap = {
      old: { uses: 9, lastUsedAt: NOW - DAY },
      recent: { uses: 1, lastUsedAt: NOW },
      alsoRecent: { uses: 3, lastUsedAt: NOW },
    };
    expect(recentIds(usage)).toEqual(["alsoRecent", "recent", "old"]);
  });
});

describe("storage", () => {
  function memoryStorage(initial: string | null) {
    let value = initial;
    return {
      getItem: (key: string) => (key === RECENTS_KEY ? value : null),
      setItem: (key: string, next: string) => {
        if (key === RECENTS_KEY) value = next;
      },
      read: () => value,
    };
  }

  it("round-trips", () => {
    const storage = memoryStorage(null);
    const usage = recordUse(NO_USAGE, "tasks.create", NOW);
    writeUsage(storage, usage);
    expect(readUsage(storage)).toEqual(usage);
  });

  it("treats a missing, unreadable or nonsense store as no history", () => {
    expect(readUsage(undefined)).toEqual(NO_USAGE);
    expect(readUsage(memoryStorage(null))).toEqual(NO_USAGE);
    expect(readUsage(memoryStorage("{"))).toEqual(NO_USAGE);
    expect(readUsage(memoryStorage('"a string"'))).toEqual(NO_USAGE);
    expect(readUsage(memoryStorage('{"a":{"uses":"many","lastUsedAt":1}}'))).toEqual(NO_USAGE);
    expect(
      readUsage({
        getItem: () => {
          throw new Error("storage is disabled");
        },
      }),
    ).toEqual(NO_USAGE);
  });

  it("keeps the entries it can read and drops the ones it cannot", () => {
    const usage = readUsage(
      memoryStorage('{"good":{"uses":2,"lastUsedAt":5},"bad":null,"worse":{"uses":1}}'),
    );
    expect(usage).toEqual({ good: { uses: 2, lastUsedAt: 5 } });
  });

  it("never throws when the store refuses a write", () => {
    expect(() =>
      writeUsage(
        {
          setItem: () => {
            throw new Error("quota exceeded");
          },
        },
        NO_USAGE,
      ),
    ).not.toThrow();
  });
});
