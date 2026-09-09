import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";

import * as copy from "@/features/today/copy";
import { TODAY, todayTask } from "@/features/today/fixtures";
import type { TodayRisk } from "@/features/today/types";

/**
 * Scans every string the copy module can produce and the comment-stripped
 * source of every non-test file in the feature. Unlike the habits and planning
 * lists, "good" is permitted: the page opens with "Good morning".
 */

const FORBIDDEN = [
  "lazy",
  "unproductive",
  "failure",
  "failed",
  "slacking",
  "wasted",
  "behind",
  "missed",
  "poor",
  "bad",
  "guilt",
  "shame",
  "overcommitted",
  "overbooked",
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

const RISKS: TodayRisk[] = [
  {
    kind: "overdue",
    task: todayTask({ id: "t1", title: "Lab report" }),
    dueDate: localDate("2026-09-07"),
    daysOverdue: 1,
  },
  {
    kind: "overdue",
    task: todayTask({ id: "t2", title: "History essay" }),
    dueDate: localDate("2026-09-01"),
    daysOverdue: 7,
  },
  {
    kind: "insufficient-time",
    warning: {
      kind: "insufficient-time",
      taskId: "t3",
      title: "Problem set",
      dueDate: TODAY,
      remainingMinutes: 180,
      availableMinutes: 60,
    },
  },
  {
    kind: "overlap",
    warning: {
      kind: "overlap",
      date: TODAY,
      first: { id: "a", title: "Chemistry lecture" },
      second: { id: "b", title: "Study group" },
      overlapMinutes: 30,
    },
  },
];

/** Every string the module holds, plus what its functions say for real inputs. */
function everyString(): string[] {
  const strings: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") strings.push(value);
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(walk);
  };
  walk(copy.TODAY_COPY);
  walk(copy.TIMELINE_STATE_LABELS);

  for (const part of ["morning", "afternoon", "evening"] as const) {
    strings.push(copy.greeting(part, "Kevin"), copy.greeting(part, ""));
  }
  strings.push(copy.longDate(TODAY));
  for (const reason of ["overdue", "due-today", "due-soon", "undated"] as const) {
    strings.push(copy.nextUpReasonLabel(reason, TODAY), copy.nextUpReasonLabel(reason, null));
  }
  for (const risk of RISKS) strings.push(copy.describeRisk(risk), copy.riskKey(risk));
  for (const count of [0, 1, 2, 9]) {
    strings.push(
      copy.TODAY_COPY.risk.count(count),
      copy.TODAY_COPY.nextUp.doneDescription(count),
      copy.TODAY_COPY.habits.count(count, 5),
      copy.TODAY_COPY.quests.count(count, 3),
      copy.TODAY_COPY.progress.level(count),
      copy.TODAY_COPY.progress.intoLevel(count, 500),
      copy.TODAY_COPY.progress.earnedToday(count),
    );
  }
  return strings;
}

describe("copy guard (Domain Rule 7)", () => {
  it("never characterises the user or the day in anything the page can say", () => {
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

describe("greeting", () => {
  it("uses the name when there is one, and stands alone when there is not", () => {
    expect(copy.greeting("morning", "Kevin")).toBe("Good morning, Kevin");
    expect(copy.greeting("evening", "  ")).toBe("Good evening");
  });
});

describe("describeRisk", () => {
  it("states an overdue deadline as a date and a count of days", () => {
    expect(copy.describeRisk(RISKS[0]!)).toBe("Lab report was due yesterday, Sep 7.");
    expect(copy.describeRisk(RISKS[1]!)).toBe("History essay was due Sep 1, 7 days ago.");
  });

  it("hands the two engine warnings straight to the engine's own sentence", () => {
    expect(copy.describeRisk(RISKS[2]!)).toContain("Problem set");
    expect(copy.describeRisk(RISKS[2]!)).toContain("3h");
    expect(copy.describeRisk(RISKS[3]!)).toBe(
      "Chemistry lecture and Study group overlap by 30m on Tue Sep 8.",
    );
  });
});

describe("riskKey", () => {
  it("is stable and distinct per row", () => {
    const keys = RISKS.map(copy.riskKey);
    expect(new Set(keys).size).toBe(RISKS.length);
    expect(keys).toEqual(RISKS.map(copy.riskKey));
  });
});
