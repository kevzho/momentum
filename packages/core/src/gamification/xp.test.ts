import { describe, expect, it } from "vitest";

import { durationMinutes, instant } from "../time";
import type { Minutes } from "../types/scalars";
import {
  REWARD_XP,
  TASK_XP,
  XP_CAP_WINDOW_MINUTES,
  XP_DAILY_CAPS,
  taskXpAward,
  xpCapWindow,
} from "./xp";

const BASE = {
  priority: 3 as const,
  projectId: null,
  estimatedMinutes: null,
  taskXpAwardedToday: 0,
};

describe("taskXpAward", () => {
  it("pays the base for an ordinary task", () => {
    expect(taskXpAward(BASE)).toMatchObject({ amount: 10, base: 10, limitedBy: "none" });
  });

  it("adds the priority bonus for a P1 and nothing for the others", () => {
    expect(taskXpAward({ ...BASE, priority: 1 }).amount).toBe(
      TASK_XP.base + TASK_XP.priorityBonusP1,
    );
    for (const priority of [2, 3, 4] as const) {
      expect(taskXpAward({ ...BASE, priority }).priorityBonus).toBe(0);
    }
  });

  it("adds the significant bonus only for a big task inside a project", () => {
    const big = 180 as Minutes;
    expect(taskXpAward({ ...BASE, projectId: "p", estimatedMinutes: big }).significantBonus).toBe(
      TASK_XP.significantBonus,
    );
    // A big task with no project is not a "significant project task".
    expect(taskXpAward({ ...BASE, projectId: null, estimatedMinutes: big }).significantBonus).toBe(
      0,
    );
    // A project task under the threshold is an ordinary one.
    expect(
      taskXpAward({ ...BASE, projectId: "p", estimatedMinutes: 30 as Minutes }).significantBonus,
    ).toBe(0);
    // Exactly at the threshold counts.
    expect(
      taskXpAward({
        ...BASE,
        projectId: "p",
        estimatedMinutes: TASK_XP.significantMinutes as Minutes,
      }).significantBonus,
    ).toBe(TASK_XP.significantBonus);
  });

  it("stacks both bonuses", () => {
    const award = taskXpAward({
      ...BASE,
      priority: 1,
      projectId: "p",
      estimatedMinutes: 240 as Minutes,
    });
    expect(award.earned).toBe(TASK_XP.base + TASK_XP.priorityBonusP1 + TASK_XP.significantBonus);
    expect(award.amount).toBe(award.earned);
  });

  it("trims the last award of a day to what the cap leaves", () => {
    const cap = XP_DAILY_CAPS.task as number;
    const award = taskXpAward({ ...BASE, taskXpAwardedToday: cap - 4 });
    expect(award.amount).toBe(4);
    expect(award.earned).toBe(10);
    expect(award.limitedBy).toBe("daily_cap");
  });

  it("awards nothing once the day's cap is full, and never a negative number", () => {
    const cap = XP_DAILY_CAPS.task as number;
    for (const awarded of [cap, cap + 50, cap * 10]) {
      const award = taskXpAward({ ...BASE, taskXpAwardedToday: awarded });
      expect(award.amount).toBe(0);
      expect(award.limitedBy).toBe("daily_cap");
    }
  });

  it("bounds a whole day of completions at the cap, however many there are", () => {
    const cap = XP_DAILY_CAPS.task as number;
    let total = 0;
    for (let i = 0; i < 500; i += 1) {
      total += taskXpAward({ ...BASE, priority: 1, taskXpAwardedToday: total }).amount;
    }
    expect(total).toBe(cap);
  });
});

describe("the tunables", () => {
  it("caps every source that a user could otherwise repeat without limit", () => {
    expect(XP_DAILY_CAPS.task).toBeGreaterThan(0);
    expect(XP_DAILY_CAPS.habit_completion).toBeGreaterThan(0);
    expect(XP_DAILY_CAPS.focus_session).toBeGreaterThan(0);
    // Quests, weekly goals and achievements are bounded by their definitions.
    expect(XP_DAILY_CAPS.quest).toBeUndefined();
    expect(XP_DAILY_CAPS.weekly_goal).toBeUndefined();
    expect(XP_DAILY_CAPS.achievement).toBeUndefined();
  });

  it("keeps a day's task XP well above a real day and well below a scripted one", () => {
    const cap = XP_DAILY_CAPS.task as number;
    expect(cap / TASK_XP.base).toBeGreaterThanOrEqual(15);
    expect(cap / TASK_XP.base).toBeLessThanOrEqual(30);
  });

  it("states flat rewards for the things a user sets themselves", () => {
    expect(REWARD_XP.weeklyGoal).toBeGreaterThan(0);
    expect(REWARD_XP.achievement).toBeGreaterThan(0);
    expect(REWARD_XP.weeklyGoalCoins).toBeGreaterThan(0);
  });
});

describe("xpCapWindow", () => {
  it("is the 24 hours before now, rolling, not the local day", () => {
    const now = instant("2026-09-09T04:10:00.000Z");
    const window = xpCapWindow(now);

    expect(window.end).toBe(now);
    expect(window.start).toBe(instant("2026-09-08T04:10:00.000Z"));
  });

  it("spans exactly XP_CAP_WINDOW_MINUTES", () => {
    const now = instant("2026-03-08T12:00:00.000Z");
    const window = xpCapWindow(now);

    expect(durationMinutes(window.start, window.end)).toBe(XP_CAP_WINDOW_MINUTES);
  });
});
