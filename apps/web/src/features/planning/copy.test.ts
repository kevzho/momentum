import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";
import { QUEST_METRICS } from "@momentum/core/types";

import type { PlanTask, PlanningGoal } from "@/features/calendar/types";
import * as copy from "@/features/planning/copy";

/**
 * Domain Rule 7, enforced: nothing the drawer says characterises the user or
 * their week. The guard scans two things — every string the copy module can
 * produce, and the source of every non-test file in the feature (comments
 * stripped, so a JSDoc explaining the rule cannot trip it) — for the words
 * that would cross the line.
 */

const FORBIDDEN = [
  "lazy",
  "unproductive",
  "failure",
  "behind",
  "overcommitted",
  "overbooked",
  "bad",
  "light",
  "heavy",
  "busy",
  "good",
  "great",
  "should",
  "you're",
] as const;

function offendingWords(text: string): string[] {
  return FORBIDDEN.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    // macOS AppleDouble sidecars are binary metadata, not source.
    if (name.startsWith("._")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function planTask(overrides: Partial<PlanTask> & Pick<PlanTask, "id" | "title">): PlanTask {
  return {
    priority: 4,
    estimatedMinutes: null,
    dueDate: null,
    projectName: null,
    projectColor: null,
    scheduledOutsideMinutes: 0,
    ...overrides,
  };
}

function goal(overrides: Partial<PlanningGoal>): PlanningGoal {
  return {
    id: "goal-1",
    title: null,
    metric: "tasks_completed",
    target: 1,
    completedAt: null,
    ...overrides,
  };
}

/** Every string the module holds, plus what its functions say for representative inputs. */
function everyString(): string[] {
  const strings: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") strings.push(value);
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(walk);
  };
  walk(copy);

  const monday = localDate("2026-09-07");
  strings.push(
    copy.workloadRowLabel({
      date: monday,
      plannedMinutes: 390,
      workingMinutes: 480,
      isToday: false,
    }),
    copy.workloadRowLabel({ date: monday, plannedMinutes: 0, workingMinutes: 0, isToday: true }),
    copy.workloadRowLabel({
      date: monday,
      plannedMinutes: 600,
      workingMinutes: 480,
      isToday: false,
    }),
    copy.dueInRangeTitle(1),
    copy.dueInRangeTitle(7),
    copy.coverageLabel(45, 120) ?? "",
    copy.coverageLabel(180, 120) ?? "",
    copy.coverageLabel(45, null) ?? "",
    copy.estimateLabel(null),
    copy.estimateLabel(90),
    copy.planTaskLabel(
      planTask({
        id: "t",
        title: "History essay",
        priority: 1,
        projectName: "History 210",
        estimatedMinutes: 120,
        dueDate: localDate("2026-09-11"),
      }),
      30,
    ),
    copy.minimumBlockMessage(15),
  );
  for (const metric of QUEST_METRICS) {
    for (const target of [1, 10, 300]) {
      strings.push(copy.goalLabel(goal({ metric, target })), copy.goalTarget(metric, target));
    }
  }
  return strings;
}

describe("copy guard (Domain Rule 7)", () => {
  it("never characterises the user or the week in anything the drawer can say", () => {
    for (const text of everyString()) {
      expect(offendingWords(text), text).toEqual([]);
    }
  });

  it("keeps every file in the feature clean of the same words", () => {
    // The test file's own path, from the runner: `import.meta.url` is not a
    // file URL under the jsdom environment.
    const testPath = expect.getState().testPath;
    expect(testPath).toBeTruthy();
    const files = sourceFiles(dirname(testPath ?? ""));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const text = stripComments(readFileSync(file, "utf8"));
      expect(offendingWords(text), file).toEqual([]);
    }
  });
});

describe("workloadRowLabel", () => {
  it("states the day, what is planned and the working window, as one sentence", () => {
    expect(
      copy.workloadRowLabel({
        date: localDate("2026-09-07"),
        plannedMinutes: 390,
        workingMinutes: 480,
        isToday: false,
      }),
    ).toBe("Mon: 6h 30m planned, 8h of working hours.");
  });

  it("names today, and says when a day has no working hours", () => {
    expect(
      copy.workloadRowLabel({
        date: localDate("2026-09-13"),
        plannedMinutes: 0,
        workingMinutes: 0,
        isToday: true,
      }),
    ).toBe("Sun, today: 0m planned, no working hours.");
  });
});

describe("task row copy", () => {
  it("composes the whole row into one accessible name, in reading order", () => {
    const task = planTask({
      id: "t",
      title: "History essay",
      priority: 2,
      projectName: "History 210",
      estimatedMinutes: 120,
      dueDate: localDate("2026-09-11"),
    });
    expect(copy.planTaskLabel(task, 30)).toBe(
      "History essay, Priority 2, History 210, 2h estimated, due Sep 11, 2026, 30m of 2h scheduled",
    );
  });

  it("omits what a task does not have", () => {
    expect(copy.planTaskLabel(planTask({ id: "t", title: "Read chapter 4" }), 0)).toBe(
      "Read chapter 4, no estimate",
    );
  });

  it("states coverage only once something is scheduled", () => {
    expect(copy.coverageLabel(0, 120)).toBeNull();
    expect(copy.coverageLabel(45, 120)).toBe("45m of 2h scheduled");
    expect(copy.coverageLabel(45, null)).toBe("45m scheduled");
    expect(copy.coverageLabel(180, 120)).toBe("3h of 2h scheduled");
  });

  it("titles the due section by the range it covers", () => {
    expect(copy.dueInRangeTitle(7)).toBe("Due this week");
    expect(copy.dueInRangeTitle(1)).toBe("Due today");
  });
});

describe("weekly goal copy", () => {
  it("prefers the goal's own title", () => {
    expect(copy.goalLabel(goal({ title: "Ship the essay", metric: "tasks_completed" }))).toBe(
      "Ship the essay",
    );
  });

  it("phrases every metric when the goal has no title", () => {
    const labels = Object.fromEntries(
      QUEST_METRICS.map((metric) => [metric, copy.goalLabel(goal({ metric, target: 10 }))]),
    );
    expect(labels).toEqual({
      tasks_completed: "Complete 10 tasks",
      priority_tasks_completed: "Complete 10 priority tasks",
      focus_minutes: "Focus 10m",
      habits_completed: "Complete 10 habits",
      habit_days: "Complete habits on 10 days",
      blocks_completed: "Complete 10 blocks",
    });
    expect(copy.goalLabel(goal({ metric: "focus_minutes", target: 300 }))).toBe("Focus 5h");
    expect(copy.goalLabel(goal({ metric: "tasks_completed", target: 1 }))).toBe("Complete 1 task");
  });

  it("states the target in the metric's own unit", () => {
    expect(copy.goalTarget("tasks_completed", 3)).toBe("3 tasks");
    expect(copy.goalTarget("focus_minutes", 90)).toBe("1h 30m");
    expect(copy.goalTarget("habit_days", 1)).toBe("1 day");
  });
});
