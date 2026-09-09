import { describe, expect, it } from "vitest";

import type { WorkBlockFact } from "./facts";
import {
  buildInsights,
  INSIGHT_THRESHOLDS,
  MIN_ESTIMATE_DEVIATION,
  TIME_OF_DAY_CUTOFF_HOUR,
  type Insight,
  type InsightInput,
  type InsightKind,
} from "./insights";
import { analyticsPeriod } from "./period";
import { block, d, NEW_YORK, session, task } from "./test-fixtures";

const period = analyticsPeriod("30", d("2026-06-17"), NEW_YORK);

const EMPTY: InsightInput = {
  period,
  timezone: NEW_YORK,
  focusSessions: [],
  completedTasks: [],
  workBlocks: [],
  projects: [],
};

/** `n` dates inside the period, one per day from 2026-06-01. */
function dates(n: number): string[] {
  return Array.from({ length: n }, (_, index) => `2026-06-${String(index + 1).padStart(2, "0")}`);
}

/** `count` blocks at `hour`, the first `done` of them completed. */
function blocks(count: number, hour: number, done: number): WorkBlockFact[] {
  return dates(count).map((date, index) => block({ date, hour, done: index < done }));
}

function only(insights: readonly Insight[], kind: InsightKind): Insight | undefined {
  return insights.find((insight) => insight.kind === kind);
}

describe("buildInsights", () => {
  it("says nothing at all for an account with no history", () => {
    expect(buildInsights(EMPTY)).toEqual([]);
  });
});

describe("the time-of-day comparison", () => {
  const { blocks: minimum, perSide } = INSIGHT_THRESHOLDS.timeOfDay;

  // 90% before the cutoff, 60% after.
  const wellSampled = [...blocks(10, 9, 9), ...blocks(10, 18, 6)];

  it("speaks once enough blocks sit on both sides of the cutoff", () => {
    const insight = only(buildInsights({ ...EMPTY, workBlocks: wellSampled }), "time-of-day");

    expect(insight?.text).toBe(
      "You marked 90% of work blocks scheduled before 4 PM as done, and 60% of those scheduled later.",
    );
    expect(insight?.sampleSize).toBe(20);
    expect(insight?.threshold).toBe(minimum);
  });

  it("is suppressed below the total threshold", () => {
    const tooFew = [...blocks(9, 9, 8), ...blocks(9, 18, 5)];
    expect(tooFew).toHaveLength(minimum - 2);

    expect(only(buildInsights({ ...EMPTY, workBlocks: tooFew }), "time-of-day")).toBeUndefined();
  });

  it("is suppressed when one side is thin, however large the total", () => {
    const lopsided = [...blocks(24, 9, 22), ...blocks(perSide - 1, 18, 2)];
    expect(lopsided.length).toBeGreaterThan(minimum);

    expect(only(buildInsights({ ...EMPTY, workBlocks: lopsided }), "time-of-day")).toBeUndefined();
  });

  it("is suppressed when the two rates are barely apart", () => {
    // 94% against 88% once the out-of-period dates are dropped.
    const flat = [...blocks(20, 9, 16), ...blocks(19, 18, 15)];

    expect(only(buildInsights({ ...EMPTY, workBlocks: flat }), "time-of-day")).toBeUndefined();
  });

  it("splits on 4 PM", () => {
    expect(TIME_OF_DAY_CUTOFF_HOUR).toBe(16);
  });
});

describe("the estimate gap", () => {
  const { tasks: minimum } = INSIGHT_THRESHOLDS.estimateGap;

  const overrun = (count: number) =>
    dates(count).map((date, index) =>
      task({ id: `t${index}`, date, hour: 9, estimated: 60, actual: 90, projectId: "p1" }),
    );

  it("names the project once enough of its tasks carry both values", () => {
    const insight = only(
      buildInsights({
        ...EMPTY,
        completedTasks: overrun(minimum),
        projects: [{ id: "p1", name: "Research" }],
      }),
      "estimate-gap",
    );

    expect(insight?.text).toBe(
      "Tasks in Research took about 50% more time than estimated over this period.",
    );
    expect(insight?.sampleSize).toBe(minimum);
  });

  it("is suppressed one task below the threshold", () => {
    const insight = only(
      buildInsights({
        ...EMPTY,
        completedTasks: overrun(minimum - 1),
        projects: [{ id: "p1", name: "Research" }],
      }),
      "estimate-gap",
    );

    expect(insight).toBeUndefined();
  });

  it("does not count unestimated tasks toward its sample", () => {
    const padded = [
      ...overrun(minimum - 1),
      ...dates(6).map((date, index) =>
        task({ id: `u${index}`, date, hour: 14, estimated: null, actual: 300, projectId: "p1" }),
      ),
    ];

    expect(
      only(
        buildInsights({ ...EMPTY, completedTasks: padded, projects: [{ id: "p1", name: "R" }] }),
        "estimate-gap",
      ),
    ).toBeUndefined();
  });

  it("stays quiet when the estimates were close", () => {
    const accurate = dates(8).map((date, index) =>
      task({ id: `t${index}`, date, hour: 9, estimated: 100, actual: 104, projectId: "p1" }),
    );

    expect(
      only(
        buildInsights({ ...EMPTY, completedTasks: accurate, projects: [{ id: "p1", name: "R" }] }),
        "estimate-gap",
      ),
    ).toBeUndefined();
    expect(MIN_ESTIMATE_DEVIATION).toBe(0.1);
  });

  it("reports an underrun in the same shape", () => {
    const under = dates(6).map((date, index) =>
      task({ id: `t${index}`, date, hour: 9, estimated: 100, actual: 70, projectId: "p1" }),
    );

    expect(
      only(
        buildInsights({ ...EMPTY, completedTasks: under, projects: [{ id: "p1", name: "Admin" }] }),
        "estimate-gap",
      )?.text,
    ).toBe("Tasks in Admin took about 30% less time than estimated over this period.");
  });

  it("calls the unassigned bucket by a name rather than leaving it blank", () => {
    const loose = dates(6).map((date, index) =>
      task({ id: `t${index}`, date, hour: 9, estimated: 60, actual: 90, projectId: null }),
    );

    expect(only(buildInsights({ ...EMPTY, completedTasks: loose }), "estimate-gap")?.text).toBe(
      "Tasks with no project took about 50% more time than estimated over this period.",
    );
  });
});

describe("the focus weekday", () => {
  const { sessions: minimum, perWeekday } = INSIGHT_THRESHOLDS.focusWeekday;

  // 2026-06-15 is a Monday, so 06-02/09/16 and 05-26 are Tuesdays.
  const tuesdays = ["2026-05-26", "2026-06-02", "2026-06-09", "2026-06-16"];
  const others = [
    "2026-06-01",
    "2026-06-03",
    "2026-06-04",
    "2026-06-05",
    "2026-06-08",
    "2026-06-10",
    "2026-06-11",
    "2026-06-12",
  ];

  const leaning = [
    ...tuesdays.map((date) => session({ date, hour: 9, minutes: 120 })),
    ...others.map((date) => session({ date, hour: 9, minutes: 30 })),
  ];

  it("names the day once enough sessions sit behind the answer", () => {
    const insight = only(buildInsights({ ...EMPTY, focusSessions: leaning }), "focus-weekday");

    expect(insight?.text).toBe("Tuesday holds the most recorded focus time in this period.");
    expect(insight?.sampleSize).toBe(minimum);
  });

  it("is suppressed below the session threshold", () => {
    const thin = leaning.slice(0, minimum - 1);

    expect(only(buildInsights({ ...EMPTY, focusSessions: thin }), "focus-weekday")).toBeUndefined();
  });

  it("is suppressed when the leading day has too few sessions of its own", () => {
    const oneBigDay = [
      session({ date: "2026-06-02", hour: 9, minutes: 600 }),
      ...others.map((date) => session({ date, hour: 9, minutes: 30 })),
      ...others.slice(0, 3).map((date) => session({ date, hour: 14, minutes: 30 })),
    ];
    expect(oneBigDay.length).toBeGreaterThanOrEqual(minimum);
    expect(perWeekday).toBeGreaterThan(1);

    expect(
      only(buildInsights({ ...EMPTY, focusSessions: oneBigDay }), "focus-weekday"),
    ).toBeUndefined();
  });

  it("is suppressed when the leader barely edges the runner-up", () => {
    const level = [
      ...tuesdays.map((date) => session({ date, hour: 9, minutes: 61 })),
      ...others.map((date) => session({ date, hour: 9, minutes: 30 })),
      ...["2026-06-01", "2026-06-08", "2026-06-03", "2026-06-10"].map((date) =>
        session({ date, hour: 14, minutes: 91 }),
      ),
    ];

    expect(
      only(buildInsights({ ...EMPTY, focusSessions: level }), "focus-weekday"),
    ).toBeUndefined();
  });
});

describe("the block completion rate", () => {
  const { blocks: minimum } = INSIGHT_THRESHOLDS.blockCompletion;

  it("reports the share marked done once enough blocks were scheduled", () => {
    const insight = only(
      buildInsights({ ...EMPTY, workBlocks: blocks(minimum, 9, 12) }),
      "block-completion",
    );

    expect(insight?.text).toBe(
      "You marked 80% of the 15 work blocks scheduled in this period as done.",
    );
  });

  it("is suppressed below the threshold", () => {
    expect(
      only(buildInsights({ ...EMPTY, workBlocks: blocks(minimum - 1, 9, 10) }), "block-completion"),
    ).toBeUndefined();
  });
});

// Domain Rule 8 written as vocabulary: no causal connective, no adjective for the user.
const CAUSAL = [
  "because",
  "due to",
  "caused",
  "causes",
  "leads to",
  "results in",
  "therefore",
  "thanks to",
  "makes you",
  "helps you",
  "explains",
  "so you",
  "means you",
  "reason",
  "why",
] as const;

const JUDGMENT = [
  "productive",
  "unproductive",
  "lazy",
  "disciplined",
  "better",
  "worse",
  "best",
  "worst",
  "should",
  "good",
  "great",
  "bad",
  "poor",
  "failure",
  "failed",
  "missed",
  "wasted",
  "behind",
  "struggling",
  "impressive",
  "you're",
  "you are",
] as const;

function offenders(text: string, words: readonly string[]): string[] {
  return words.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

describe("the vocabulary of every insight", () => {
  const everySentence: string[] = [
    ...buildInsights({
      ...EMPTY,
      workBlocks: [...blocks(10, 9, 9), ...blocks(10, 18, 6)],
    }),
    ...buildInsights({
      ...EMPTY,
      completedTasks: dates(6).map((date, index) =>
        task({ id: `t${index}`, date, hour: 9, estimated: 60, actual: 90, projectId: "p1" }),
      ),
      projects: [{ id: "p1", name: "Research" }],
    }),
    ...buildInsights({
      ...EMPTY,
      completedTasks: dates(6).map((date, index) =>
        task({ id: `t${index}`, date, hour: 9, estimated: 100, actual: 40, projectId: null }),
      ),
    }),
    ...buildInsights({
      ...EMPTY,
      focusSessions: [
        ...["2026-05-26", "2026-06-02", "2026-06-09", "2026-06-16"].map((date) =>
          session({ date, hour: 9, minutes: 120 }),
        ),
        ...dates(8).map((date) => session({ date, hour: 14, minutes: 20 })),
      ],
    }),
    // A period where almost nothing was completed.
    ...buildInsights({ ...EMPTY, workBlocks: [...blocks(12, 9, 1), ...blocks(12, 18, 0)] }),
  ].map((insight) => insight.text);

  it("covers all four kinds", () => {
    expect(everySentence.length).toBeGreaterThanOrEqual(6);
  });

  it("makes no causal claim", () => {
    for (const text of everySentence) {
      expect({ text, causal: offenders(text, CAUSAL) }).toEqual({ text, causal: [] });
    }
  });

  it("never characterises or judges the user", () => {
    for (const text of everySentence) {
      expect({ text, judgment: offenders(text, JUDGMENT) }).toEqual({ text, judgment: [] });
    }
  });

  it("states a measurement and ends there", () => {
    for (const text of everySentence) {
      expect(text.endsWith(".")).toBe(true);
      // One sentence each.
      expect(text.split(". ").length).toBe(1);
    }
  });
});
