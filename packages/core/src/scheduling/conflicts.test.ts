import { describe, expect, it } from "vitest";

import { fromLocal, ianaTimeZone, localDate, localTime } from "../time";
import type { LocalDate, Minutes, TimeWindow, WorkingHours } from "../types";
import {
  describeWarning,
  detectConflicts,
  exceedsWorkingWindow,
  overCapacityTolerance,
  warningKey,
} from "./conflicts";
import type { Commitment, PlanningContext, PlanningTask, PlanningWarning } from "./types";

/**
 * The four warnings under the New York fixture week (Mon 2026-09-07, today
 * Wed 2026-09-09). Fixture-driven, no mocks, no clock: `now` is an input.
 */
const NEW_YORK = ianaTimeZone("America/New_York");

const d = localDate;
const t = localTime;

const MON = d("2026-09-07");
const TUE = d("2026-09-08");
const WED = d("2026-09-09");
const THU = d("2026-09-10");
const FRI = d("2026-09-11");
const SAT = d("2026-09-12");
const SUN = d("2026-09-13");
const NEXT_MON = d("2026-09-14");
const WEEK: readonly LocalDate[] = [MON, TUE, WED, THU, FRI, SAT, SUN];

const NINE_TO_FIVE: TimeWindow = { start: t("09:00"), end: t("17:00") };
const NINE_TO_ONE: TimeWindow = { start: t("09:00"), end: t("13:00") };

/** Mon–Thu 8h, Fri 4h, weekend off: 2160 working minutes in the week. */
const HOURS: WorkingHours = {
  0: [],
  1: [NINE_TO_FIVE],
  2: [NINE_TO_FIVE],
  3: [NINE_TO_FIVE],
  4: [NINE_TO_FIVE],
  5: [NINE_TO_ONE],
  6: [],
};

function context(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    timezone: NEW_YORK,
    workingHours: HOURS,
    focusWindows: [],
    days: WEEK,
    today: WED,
    ...overrides,
  };
}

function at(date: LocalDate, minutes: Minutes) {
  return fromLocal(date, minutes, NEW_YORK);
}

function commitment(
  overrides: Partial<Commitment> & Pick<Commitment, "id" | "startAt" | "endAt">,
): Commitment {
  return {
    kind: "event",
    title: overrides.id,
    allDay: false,
    completedAt: null,
    taskId: null,
    taskDueDate: null,
    taskCompletedAt: null,
    ...overrides,
  };
}

function event(
  id: string,
  date: LocalDate,
  start: Minutes,
  end: Minutes,
  overrides: Partial<Commitment> = {},
): Commitment {
  return commitment({ id, startAt: at(date, start), endAt: at(date, end), ...overrides });
}

function work(
  id: string,
  taskId: string,
  date: LocalDate,
  start: Minutes,
  end: Minutes,
  overrides: Partial<Commitment> = {},
): Commitment {
  return commitment({
    id,
    kind: "work",
    taskId,
    startAt: at(date, start),
    endAt: at(date, end),
    ...overrides,
  });
}

function task(overrides: Partial<PlanningTask> & Pick<PlanningTask, "id">): PlanningTask {
  return {
    title: overrides.id,
    estimatedMinutes: null,
    dueDate: null,
    scheduledOutsideMinutes: 0,
    ...overrides,
  };
}

interface Scenario {
  commitments?: Commitment[];
  tasks?: PlanningTask[];
  context?: PlanningContext;
  now?: ReturnType<typeof at> | null;
}

function conflicts({ commitments = [], tasks = [], context: ctx, now = null }: Scenario) {
  return detectConflicts({ context: ctx ?? context(), commitments, tasks, now });
}

function ofKind<K extends PlanningWarning["kind"]>(warnings: PlanningWarning[], kind: K) {
  return warnings.filter((warning): warning is Extract<PlanningWarning, { kind: K }> => {
    return warning.kind === kind;
  });
}

/** A deterministic Fisher–Yates: the test needs "some other order", not randomness. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  let state = seed;
  for (let n = out.length - 1; n > 0; n -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const k = state % (n + 1);
    const a = out[n];
    const b = out[k];
    if (a !== undefined && b !== undefined) {
      out[n] = b;
      out[k] = a;
    }
  }
  return out;
}

describe("overlap", () => {
  it("reports one warning per overlapping pair with the earlier block first", () => {
    const warnings = conflicts({
      commitments: [event("essay", TUE, 600, 720), event("sync", TUE, 540, 630)],
    });
    expect(warnings).toEqual([
      {
        kind: "overlap",
        date: TUE,
        first: { id: "sync", title: "sync" },
        second: { id: "essay", title: "essay" },
        overlapMinutes: 30,
      },
    ]);
  });

  it("counts two events overlapping: that is a double booking", () => {
    const warnings = conflicts({
      commitments: [event("class", THU, 540, 660), event("dentist", THU, 600, 660)],
    });
    expect(ofKind(warnings, "overlap")).toHaveLength(1);
  });

  it("does not warn for touching blocks, settled blocks or all-day items", () => {
    expect(
      conflicts({ commitments: [event("a", TUE, 540, 600), event("b", TUE, 600, 660)] }),
    ).toEqual([]);
    expect(
      conflicts({
        commitments: [
          event("a", TUE, 540, 600),
          work("settled", "t", TUE, 540, 600, { taskCompletedAt: at(MON, 0) }),
        ],
      }),
    ).toEqual([]);
    expect(
      conflicts({
        commitments: [
          event("a", TUE, 540, 600),
          commitment({ id: "bday", allDay: true, startAt: at(TUE, 0), endAt: at(WED, 0) }),
        ],
      }),
    ).toEqual([]);
  });

  it("breaks a tie on start by the smaller id", () => {
    const [warning] = conflicts({
      commitments: [event("b", TUE, 540, 600), event("a", TUE, 540, 570)],
    });
    expect(warning).toMatchObject({ first: { id: "a" }, second: { id: "b" }, overlapMinutes: 30 });
  });

  it("dates the overlap by the later start, so a pair across midnight lands on the second day", () => {
    const [warning] = conflicts({
      commitments: [
        commitment({ id: "late", startAt: at(TUE, 1380), endAt: at(WED, 60) }),
        commitment({ id: "later", startAt: at(WED, 30), endAt: at(WED, 90) }),
      ],
    });
    expect(warning).toMatchObject({ kind: "overlap", date: WED, overlapMinutes: 30 });
  });

  it("reports every pair of a cluster once, ordered by date, first id, second id", () => {
    const warnings = conflicts({
      commitments: [
        event("c", THU, 540, 600),
        event("b", THU, 540, 600),
        event("a", THU, 540, 600),
        event("y", TUE, 600, 660),
        event("x", TUE, 630, 700),
      ],
    });
    expect(warnings.map(warningKey)).toEqual([
      "overlap:y:x",
      "overlap:a:b",
      "overlap:a:c",
      "overlap:b:c",
    ]);
  });
});

describe("past deadline", () => {
  const dueThu = { taskDueDate: THU };

  it("warns for a work block that starts on a local date after the task's due date", () => {
    const warnings = conflicts({ commitments: [work("essay", "t1", FRI, 540, 600, dueThu)] });
    expect(warnings).toEqual([
      {
        kind: "past-deadline",
        block: { id: "essay", title: "essay" },
        taskId: "t1",
        dueDate: THU,
        date: FRI,
      },
    ]);
  });

  it("does not warn for a block on the due date itself, even at 23:30 local", () => {
    // 23:30 Thursday in New York is already Friday in UTC (Domain Rule 4).
    const warnings = conflicts({ commitments: [work("late", "t1", THU, 1410, 1440, dueThu)] });
    expect(ofKind(warnings, "past-deadline")).toEqual([]);
  });

  it("warns one minute into the next day", () => {
    const warnings = conflicts({ commitments: [work("late", "t1", FRI, 0, 30, dueThu)] });
    expect(ofKind(warnings, "past-deadline")).toHaveLength(1);
  });

  it("says nothing for a completed task's blocks, an undated task, or an event", () => {
    expect(
      conflicts({
        commitments: [
          work("settled", "t1", FRI, 540, 600, { ...dueThu, taskCompletedAt: at(THU, 0) }),
          work("undated", "t2", FRI, 600, 660),
          event("meeting", FRI, 660, 720),
        ],
      }),
    ).toEqual([]);
  });

  it("still warns for an executed block: it was scheduled after the deadline", () => {
    const warnings = conflicts({
      commitments: [work("done", "t1", FRI, 540, 600, { ...dueThu, completedAt: at(FRI, 600) })],
    });
    expect(ofKind(warnings, "past-deadline")).toHaveLength(1);
  });

  it("orders by date then block id", () => {
    const warnings = conflicts({
      commitments: [
        work("z", "t1", SAT, 540, 600, dueThu),
        work("b", "t1", FRI, 540, 600, dueThu),
        work("a", "t2", FRI, 600, 660, { taskDueDate: WED }),
      ],
    });
    expect(warnings.map(warningKey)).toEqual([
      "past-deadline:a",
      "past-deadline:b",
      "past-deadline:z",
    ]);
  });
});

describe("over capacity", () => {
  it("allows a quarter of the window, never less than an hour", () => {
    expect(overCapacityTolerance(480)).toBe(120);
    expect(overCapacityTolerance(240)).toBe(60);
    expect(overCapacityTolerance(120)).toBe(60);
    expect(overCapacityTolerance(0)).toBe(60);
    expect(overCapacityTolerance(300)).toBe(75);
  });

  it("is exceeded strictly above the window plus its tolerance", () => {
    expect(exceedsWorkingWindow(600, 480)).toBe(false);
    expect(exceedsWorkingWindow(601, 480)).toBe(true);
    expect(exceedsWorkingWindow(60, 0)).toBe(false);
    expect(exceedsWorkingWindow(61, 0)).toBe(true);
  });

  it("does not warn at exactly working plus tolerance, and warns one minute over", () => {
    const tenHours = event("long", TUE, 480, 1080);
    expect(conflicts({ commitments: [tenHours] })).toEqual([]);
    const warnings = conflicts({ commitments: [tenHours, event("extra", TUE, 1080, 1081)] });
    expect(warnings).toEqual([
      { kind: "over-capacity", date: TUE, plannedMinutes: 601, workingMinutes: 480 },
    ]);
  });

  it("warns for a day off above sixty minutes planned", () => {
    expect(conflicts({ commitments: [event("errand", SAT, 600, 660)] })).toEqual([]);
    const warnings = conflicts({ commitments: [event("errand", SAT, 600, 661)] });
    expect(warnings).toEqual([
      { kind: "over-capacity", date: SAT, plannedMinutes: 61, workingMinutes: 0 },
    ]);
  });

  it("warns for the range on the week's totals, with no day over its own window", () => {
    // Mon–Thu at their edge (600 each), Fri at its edge (300): 2700 planned
    // against 2160 working, and the range's tolerance is 540 — exactly at it.
    const atTheEdge = [
      event("mon", MON, 480, 1080),
      event("tue", TUE, 480, 1080),
      event("wed", WED, 480, 1080),
      event("thu", THU, 480, 1080),
      event("fri", FRI, 480, 780),
    ];
    expect(conflicts({ commitments: atTheEdge })).toEqual([]);

    // One more minute, on a day that stays within its own tolerance.
    const warnings = conflicts({ commitments: [...atTheEdge, event("sun", SUN, 600, 601)] });
    expect(warnings).toEqual([
      { kind: "over-capacity", date: null, plannedMinutes: 2701, workingMinutes: 2160 },
    ]);
  });

  it("can fire for a day and the range at once, days in range order and the range last", () => {
    const warnings = conflicts({
      commitments: [
        event("thu", THU, 0, 1440),
        event("mon", MON, 0, 1440),
        event("sat", SAT, 600, 720),
      ],
    });
    expect(warnings.map(warningKey)).toEqual([
      `over-capacity:${MON}`,
      `over-capacity:${THU}`,
      `over-capacity:${SAT}`,
      "over-capacity:range",
    ]);
  });

  it("counts planned by claim, so two overlapping blocks can exceed the window together", () => {
    // 09:00–17:00 twice is 960 planned against 480 working.
    const warnings = conflicts({
      commitments: [event("a", TUE, 540, 1020), work("b", "t", TUE, 540, 1020)],
    });
    expect(ofKind(warnings, "over-capacity")).toEqual([
      { kind: "over-capacity", date: TUE, plannedMinutes: 960, workingMinutes: 480 },
    ]);
  });
});

describe("insufficient time", () => {
  const essay = task({ id: "essay", estimatedMinutes: 180, dueDate: WED });
  const morningMeeting = event("meeting", WED, 540, 780);

  it("does not fire with now null when the whole day counts", () => {
    // 09:00–13:00 is taken; 13:00–17:00 leaves 240 open for 180 of work.
    expect(conflicts({ commitments: [morningMeeting], tasks: [essay], now: null })).toEqual([]);
  });

  it("fires with now mid-day when the morning is gone", () => {
    const warnings = conflicts({
      commitments: [morningMeeting],
      tasks: [essay],
      now: at(WED, 900),
    });
    expect(warnings).toEqual([
      {
        kind: "insufficient-time",
        taskId: "essay",
        title: "essay",
        dueDate: WED,
        remainingMinutes: 180,
        availableMinutes: 120,
      },
    ]);
  });

  it("reports zero open minutes when now is past the working window", () => {
    const [warning] = conflicts({ tasks: [essay], now: at(WED, 1080) });
    expect(warning).toMatchObject({ kind: "insufficient-time", availableMinutes: 0 });
  });

  it("counts every working day from today to the due date, minus the busy list", () => {
    const report = task({ id: "report", estimatedMinutes: 900, dueDate: THU });
    // Wed 480 + Thu 480 = 960 open: enough.
    expect(conflicts({ tasks: [report] })).toEqual([]);
    // A two-hour block on Thursday leaves 840.
    const warnings = conflicts({ commitments: [event("class", THU, 600, 720)], tasks: [report] });
    expect(warnings).toEqual([
      {
        kind: "insufficient-time",
        taskId: "report",
        title: "report",
        dueDate: THU,
        remainingMinutes: 900,
        availableMinutes: 840,
      },
    ]);
  });

  it("subtracts what is already scheduled toward the task, inside and outside the range", () => {
    const report = task({
      id: "report",
      estimatedMinutes: 1000,
      dueDate: THU,
      scheduledOutsideMinutes: 20,
    });
    // 1000 − 20 − 60 = 920 remaining against 960 − 60 = 900 open.
    const warnings = conflicts({
      commitments: [work("w", "report", THU, 540, 600)],
      tasks: [report],
    });
    expect(warnings).toMatchObject([{ remainingMinutes: 920, availableMinutes: 900 }]);
  });

  it("never fires for a task due after the range", () => {
    const huge = task({ id: "huge", estimatedMinutes: 100_000, dueDate: NEXT_MON });
    expect(conflicts({ tasks: [huge] })).toEqual([]);
  });

  it("never fires for a task due before the range when a later week is being planned", () => {
    const nextWeek = context({ days: WEEK.map((_, index) => d(`2026-09-${14 + index}`)) });
    const huge = task({ id: "huge", estimatedMinutes: 100_000, dueDate: FRI });
    expect(conflicts({ tasks: [huge], context: nextWeek })).toEqual([]);
  });

  it("never fires for an overdue task", () => {
    const overdue = task({ id: "overdue", estimatedMinutes: 100_000, dueDate: TUE });
    expect(conflicts({ tasks: [overdue] })).toEqual([]);
  });

  it("never fires for a covered, over-scheduled or unestimated task", () => {
    const warnings = conflicts({
      commitments: [work("a", "covered", WED, 540, 600), work("b", "over", WED, 600, 720)],
      tasks: [
        task({ id: "covered", estimatedMinutes: 60, dueDate: WED }),
        task({ id: "over", estimatedMinutes: 60, dueDate: WED }),
        task({ id: "unestimated", dueDate: WED }),
      ],
      now: at(WED, 1080),
    });
    expect(ofKind(warnings, "insufficient-time")).toEqual([]);
  });

  it("does not fire one minute short: remaining equal to available is enough", () => {
    const exact = task({ id: "exact", estimatedMinutes: 120, dueDate: WED });
    expect(conflicts({ tasks: [exact], now: at(WED, 900) })).toEqual([]);
    const overBy1 = task({ id: "over", estimatedMinutes: 121, dueDate: WED });
    expect(conflicts({ tasks: [overBy1], now: at(WED, 900) })).toHaveLength(1);
  });

  it("counts a task once and orders by due date then task id", () => {
    const b = task({ id: "b", estimatedMinutes: 5000, dueDate: THU });
    const a = task({ id: "a", estimatedMinutes: 5000, dueDate: THU });
    const today = task({ id: "z", estimatedMinutes: 5000, dueDate: WED });
    const warnings = conflicts({ tasks: [b, a, today, b, a] });
    expect(warnings.map(warningKey)).toEqual([
      "insufficient-time:z",
      "insufficient-time:a",
      "insufficient-time:b",
    ]);
  });

  it("counts from the first day of a future range, not from today", () => {
    const nextWeek = context({ days: WEEK.map((_, index) => d(`2026-09-${14 + index}`)) });
    const report = task({ id: "report", estimatedMinutes: 500, dueDate: d("2026-09-14") });
    // Only Monday the 14th counts: 480 open, and `now` on the 9th cuts nothing.
    const warnings = conflicts({ tasks: [report], context: nextWeek, now: at(WED, 900) });
    expect(warnings).toMatchObject([{ remainingMinutes: 500, availableMinutes: 480 }]);
  });
});

describe("detectConflicts", () => {
  const mixed: Scenario = {
    commitments: [
      work("essay-fri", "essay", FRI, 540, 600, { taskDueDate: THU }),
      event("sat-long", SAT, 480, 720),
      event("sync", TUE, 540, 630),
      work("essay-tue", "essay", TUE, 600, 720, { taskDueDate: THU }),
      event("thu-all", THU, 0, 1440),
      event("mon-all", MON, 0, 1440),
      event("wed-all", WED, 0, 1440),
    ],
    tasks: [
      task({ id: "essay", estimatedMinutes: 600, dueDate: THU }),
      task({ id: "slides", estimatedMinutes: 30, dueDate: THU }),
    ],
    now: at(WED, 600),
  };

  it("lists overlaps, then past deadlines, then over capacity, then insufficient time", () => {
    const warnings = conflicts(mixed);
    expect(warnings.map(warningKey)).toEqual([
      "overlap:sync:essay-tue",
      "past-deadline:essay-fri",
      `over-capacity:${MON}`,
      `over-capacity:${WED}`,
      `over-capacity:${THU}`,
      `over-capacity:${SAT}`,
      "over-capacity:range",
      "insufficient-time:essay",
      "insufficient-time:slides",
    ]);
  });

  it("is deterministic: the order of the input does not change the output", () => {
    const expected = conflicts(mixed);
    const commitments = mixed.commitments ?? [];
    const tasks = mixed.tasks ?? [];
    const permutations = [
      { commitments: commitments.slice().reverse(), tasks: tasks.slice().reverse() },
      { commitments: [...commitments.slice(3), ...commitments.slice(0, 3)], tasks },
      { commitments: shuffled(commitments, 7), tasks: shuffled(tasks, 7) },
      { commitments: shuffled(commitments, 99), tasks: shuffled(tasks, 3) },
    ];
    for (const permutation of permutations) {
      expect(conflicts({ ...mixed, ...permutation })).toEqual(expected);
    }
  });

  it("gives every warning in a mixed list a distinct key", () => {
    const keys = conflicts(mixed).map(warningKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns nothing for an empty week", () => {
    expect(conflicts({})).toEqual([]);
  });

  it("keeps the block-level warnings over an empty range and drops the day-level ones", () => {
    // Overlap and past deadline are facts about the blocks; over capacity and
    // insufficient time are facts about days, and there are none.
    expect(conflicts({ ...mixed, context: context({ days: [] }) }).map(warningKey)).toEqual([
      "overlap:sync:essay-tue",
      "past-deadline:essay-fri",
    ]);
  });
});

describe("warningKey", () => {
  it("names the kind and what it points at", () => {
    expect(
      warningKey({
        kind: "overlap",
        date: TUE,
        first: { id: "a", title: "A" },
        second: { id: "b", title: "B" },
        overlapMinutes: 30,
      }),
    ).toBe("overlap:a:b");
    expect(
      warningKey({
        kind: "past-deadline",
        block: { id: "blk", title: "X" },
        taskId: "t",
        dueDate: THU,
        date: FRI,
      }),
    ).toBe("past-deadline:blk");
    expect(
      warningKey({ kind: "over-capacity", date: TUE, plannedMinutes: 0, workingMinutes: 0 }),
    ).toBe("over-capacity:2026-09-08");
    expect(
      warningKey({ kind: "over-capacity", date: null, plannedMinutes: 0, workingMinutes: 0 }),
    ).toBe("over-capacity:range");
    expect(
      warningKey({
        kind: "insufficient-time",
        taskId: "t",
        title: "X",
        dueDate: THU,
        remainingMinutes: 1,
        availableMinutes: 0,
      }),
    ).toBe("insufficient-time:t");
  });
});

describe("describeWarning", () => {
  const samples: PlanningWarning[] = [
    {
      kind: "overlap",
      date: TUE,
      first: { id: "a", title: "Team sync" },
      second: { id: "b", title: "History essay" },
      overlapMinutes: 30,
    },
    {
      kind: "past-deadline",
      block: { id: "blk", title: "History essay" },
      taskId: "t",
      dueDate: THU,
      date: FRI,
    },
    { kind: "over-capacity", date: TUE, plannedMinutes: 570, workingMinutes: 480 },
    { kind: "over-capacity", date: SAT, plannedMinutes: 120, workingMinutes: 0 },
    { kind: "over-capacity", date: null, plannedMinutes: 2700, workingMinutes: 2400 },
    {
      kind: "insufficient-time",
      taskId: "t",
      title: "History essay",
      dueDate: THU,
      remainingMinutes: 180,
      availableMinutes: 90,
    },
  ];

  it("states each fact in the documented shape", () => {
    expect(samples.map(describeWarning)).toEqual([
      "Team sync and History essay overlap by 30m on Tue Sep 8.",
      "History essay is scheduled on Fri Sep 11, after its Thu Sep 10 deadline.",
      "Tue Sep 8 has 9h 30m planned against 8h of working hours.",
      "Sat Sep 12 has 2h planned and no working hours configured.",
      "This range has 45h planned against 40h of working hours.",
      "History essay: 3h still to schedule, 1h 30m of working hours open before the Thu Sep 10 deadline.",
    ]);
  });

  it("describes a range with no working hours the same way as a day off", () => {
    expect(
      describeWarning({ kind: "over-capacity", date: null, plannedMinutes: 90, workingMinutes: 0 }),
    ).toBe("This range has 1h 30m planned and no working hours configured.");
  });

  it("never characterises or judges the user (Domain Rule 7)", () => {
    const banned =
      /\b(you|your|lazy|unproductive|failure|behind|overcommitted|overbooked|bad|light day|busy day|should|too much)\b/i;
    for (const sentence of samples.map(describeWarning)) {
      expect(sentence).not.toMatch(banned);
    }
  });
});
