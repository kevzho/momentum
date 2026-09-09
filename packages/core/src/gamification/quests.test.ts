import { describe, expect, it } from "vitest";

import { instant, localDate } from "../time";
import type { QuestMetric, QuestPeriod } from "../types/gamification";
import type { IanaTimeZone, Minutes } from "../types/scalars";
import {
  EMPTY_QUEST_FACTS,
  QUEST_SLOTS,
  QUEST_TARGET_CAPS,
  isHealthyQuestTarget,
  metricValue,
  questFactsFor,
  questProgress,
  questRotationOffset,
  selectQuests,
} from "./quests";

interface Definition {
  key: string;
  period: QuestPeriod;
  active: boolean;
}

const DAILY: Definition[] = [
  { key: "daily_focus_50", period: "daily", active: true },
  { key: "daily_priority_task", period: "daily", active: true },
  { key: "daily_three_tasks", period: "daily", active: true },
  { key: "daily_two_blocks", period: "daily", active: true },
  { key: "daily_two_habits", period: "daily", active: true },
];

const WEEKLY: Definition[] = [
  { key: "weekly_focus_240", period: "weekly", active: true },
  { key: "weekly_habit_days", period: "weekly", active: true },
  { key: "weekly_ten_blocks", period: "weekly", active: true },
  { key: "weekly_twelve_tasks", period: "weekly", active: true },
];

const ALL = [...DAILY, ...WEEKLY];

const ALICE = "3f2a91c4-5d6e-4a7b-8c9d-0e1f2a3b4c5d";
const BOB = "8b7c6d5e-4f3a-4b2c-9d8e-7f6a5b4c3d2e";

describe("selectQuests", () => {
  const date = localDate("2026-09-07");

  it("is deterministic for one user and date", () => {
    const first = selectQuests(ALL, ALICE, "daily", date);
    for (let i = 0; i < 25; i += 1) {
      expect(selectQuests(ALL, ALICE, "daily", date).map((q) => q.key)).toEqual(
        first.map((q) => q.key),
      );
    }
  });

  it("does not depend on the order the definitions arrive in", () => {
    const shuffled = [...ALL].reverse();
    expect(selectQuests(shuffled, ALICE, "daily", date).map((q) => q.key)).toEqual(
      selectQuests(ALL, ALICE, "daily", date).map((q) => q.key),
    );
  });

  it("assigns three daily quests and two weekly ones", () => {
    expect(selectQuests(ALL, ALICE, "daily", date)).toHaveLength(QUEST_SLOTS.daily);
    expect(selectQuests(ALL, ALICE, "weekly", date)).toHaveLength(QUEST_SLOTS.weekly);
    expect(QUEST_SLOTS.daily).toBeGreaterThanOrEqual(3);
    expect(QUEST_SLOTS.daily).toBeLessThanOrEqual(4);
  });

  it("only ever returns the period asked for, and never an inactive quest", () => {
    const withRetired = [...ALL, { key: "daily_retired", period: "daily" as const, active: false }];
    for (const quest of selectQuests(withRetired, ALICE, "daily", date)) {
      expect(quest.period).toBe("daily");
      expect(quest.active).toBe(true);
    }
  });

  it("never repeats a quest within one day's assignment", () => {
    for (let day = 0; day < 40; day += 1) {
      const on = localDate(`2026-09-${String((day % 28) + 1).padStart(2, "0")}`);
      const keys = selectQuests(ALL, ALICE, "daily", on).map((q) => q.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("moves the set on from one day to the next", () => {
    const monday = selectQuests(ALL, ALICE, "daily", localDate("2026-09-07")).map((q) => q.key);
    const tuesday = selectQuests(ALL, ALICE, "daily", localDate("2026-09-08")).map((q) => q.key);
    expect(tuesday).not.toEqual(monday);
  });

  it("does not hand two accounts the same list on the same day", () => {
    const alice = selectQuests(ALL, ALICE, "daily", date).map((q) => q.key);
    const bob = selectQuests(ALL, BOB, "daily", date).map((q) => q.key);
    expect(bob).not.toEqual(alice);
  });

  it("offers every quest over a full rotation rather than favouring some", () => {
    const seen = new Set<string>();
    for (let day = 0; day < DAILY.length; day += 1) {
      const on = localDate("2026-09-01");
      const shifted = localDate(`2026-09-${String(Number(on.slice(8)) + day).padStart(2, "0")}`);
      for (const quest of selectQuests(ALL, ALICE, "daily", shifted)) seen.add(quest.key);
    }
    expect(seen.size).toBe(DAILY.length);
  });

  it("copes with fewer definitions than slots, and with none", () => {
    const one = [DAILY[0] as Definition];
    expect(selectQuests(one, ALICE, "daily", date)).toHaveLength(1);
    expect(selectQuests([], ALICE, "daily", date)).toEqual([]);
  });

  it("reads an account offset out of the uuid, and survives a malformed one", () => {
    expect(questRotationOffset(ALICE)).toBe(Number.parseInt("4c5d", 16));
    expect(questRotationOffset("not-a-uuid")).toBe(0);
  });
});

describe("quest targets are bounded", () => {
  const metrics: QuestMetric[] = [
    "tasks_completed",
    "priority_tasks_completed",
    "focus_minutes",
    "habits_completed",
    "habit_days",
    "blocks_completed",
  ];

  it("names a cap for every metric in both periods", () => {
    for (const period of ["daily", "weekly"] as const) {
      for (const metric of metrics) {
        expect(QUEST_TARGET_CAPS[period][metric]).toBeGreaterThan(0);
      }
    }
  });

  it("never allows a day of focus that would be unhealthy", () => {
    expect(QUEST_TARGET_CAPS.daily.focus_minutes).toBeLessThanOrEqual(2 * 60);
    expect(QUEST_TARGET_CAPS.weekly.focus_minutes).toBeLessThanOrEqual(6 * 60);
    expect(isHealthyQuestTarget("daily", "focus_minutes", 8 * 60)).toBe(false);
    expect(isHealthyQuestTarget("daily", "focus_minutes", 50)).toBe(true);
  });

  it("rejects a non-positive target", () => {
    expect(isHealthyQuestTarget("daily", "tasks_completed", 0)).toBe(false);
    expect(isHealthyQuestTarget("daily", "tasks_completed", -3)).toBe(false);
  });

  it("keeps a week's targets reachable inside a working week", () => {
    expect(QUEST_TARGET_CAPS.weekly.habit_days).toBeLessThanOrEqual(7);
    expect(QUEST_TARGET_CAPS.weekly.focus_minutes / 5).toBeLessThanOrEqual(90);
  });
});

describe("questProgress", () => {
  const facts = {
    tasksCompleted: 4,
    priorityTasksCompleted: 1,
    focusMinutes: 75,
    habitsCompleted: 2,
    habitDays: 2,
    blocksCompleted: 3,
  };

  it("reads the metric it was asked for", () => {
    expect(metricValue(facts, "tasks_completed")).toBe(4);
    expect(metricValue(facts, "focus_minutes")).toBe(75);
    expect(metricValue(facts, "habit_days")).toBe(2);
    expect(metricValue(EMPTY_QUEST_FACTS, "blocks_completed")).toBe(0);
  });

  it("clamps the fraction and reports whether the target is met", () => {
    expect(questProgress(facts, "tasks_completed", 3)).toMatchObject({
      value: 4,
      target: 3,
      fraction: 1,
      met: true,
    });
    expect(questProgress(facts, "focus_minutes", 150).fraction).toBeCloseTo(0.5);
    expect(questProgress(EMPTY_QUEST_FACTS, "tasks_completed", 3).met).toBe(false);
  });

  it("does not divide by zero for a target the schema would refuse", () => {
    expect(questProgress(facts, "tasks_completed", 0).fraction).toBe(1);
  });
});

describe("questFactsFor", () => {
  const tz = "America/New_York" as IanaTimeZone;
  const today = localDate("2026-09-07");

  const sources = {
    completedTasks: [
      // 23:40 local on the 7th — the UTC date is already the 8th.
      { completedAt: instant("2026-09-08T03:40:00.000Z"), priority: 1 as const },
      { completedAt: instant("2026-09-07T14:00:00.000Z"), priority: 3 as const },
      { completedAt: instant("2026-09-06T14:00:00.000Z"), priority: 1 as const },
      { completedAt: null, priority: 2 as const },
    ],
    focusSessions: [
      { startedAt: instant("2026-09-07T13:00:00.000Z"), actualMinutes: 50 as Minutes },
      { startedAt: instant("2026-09-07T18:00:00.000Z"), actualMinutes: 12 as Minutes },
      { startedAt: instant("2026-09-06T18:00:00.000Z"), actualMinutes: 30 as Minutes },
      { startedAt: instant("2026-09-07T19:00:00.000Z"), actualMinutes: null },
    ],
    habitCompletions: [
      { completionDate: localDate("2026-09-07") },
      { completionDate: localDate("2026-09-07") },
      { completionDate: localDate("2026-09-06") },
    ],
    completedBlocks: [
      { completedAt: instant("2026-09-07T15:00:00.000Z") },
      { completedAt: instant("2026-09-06T15:00:00.000Z") },
      { completedAt: null },
    ],
  };

  it("counts one local day, including a late evening that is tomorrow in UTC", () => {
    const facts = questFactsFor(sources, tz, [today]);
    expect(facts).toEqual({
      tasksCompleted: 2,
      priorityTasksCompleted: 1,
      focusMinutes: 62,
      habitsCompleted: 2,
      habitDays: 1,
      blocksCompleted: 1,
    });
  });

  it("counts a week over its seven dates", () => {
    const week = [
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ].map(localDate);
    const facts = questFactsFor(sources, tz, week);
    expect(facts).toMatchObject({
      tasksCompleted: 3,
      priorityTasksCompleted: 2,
      focusMinutes: 92,
      habitsCompleted: 3,
      habitDays: 2,
      blocksCompleted: 2,
    });
  });

  it("is empty for a period with nothing in it", () => {
    expect(questFactsFor(sources, tz, [localDate("2026-10-01")])).toEqual(EMPTY_QUEST_FACTS);
  });
});
