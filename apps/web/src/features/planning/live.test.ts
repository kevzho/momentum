import { describe, expect, it } from "vitest";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import type { Commitment } from "@momentum/core/scheduling";
import { ianaTimeZone, instant, localDate, localTime } from "@momentum/core/time";
import type { WorkingHours } from "@momentum/core/types";

import { MIN_BLOCK_MINUTES } from "@momentum/core/calendar";

import { DEFAULT_TASK_BLOCK_MINUTES } from "@/features/calendar/dnd";
import type {
  CalendarItem,
  CalendarSettings,
  PlanTask,
  PlanningData,
} from "@/features/calendar/types";
import {
  commitmentsOf,
  liveSections,
  planningContextOf,
  planningTaskOf,
  planningTasksOf,
  taskBlockMinutes,
} from "@/features/planning/live";

/**
 * The projections the drawer's numbers are built on. Each is field-for-field
 * and pure; what is tested is that nothing is lost, invented or reordered on
 * the way from the board's view models to the scheduler's inputs.
 */

const DAYS = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
].map(localDate);

const TODAY = localDate("2026-09-08");

const SETTINGS: CalendarSettings = {
  timezone: ianaTimeZone("America/New_York"),
  weekStart: 1,
  snapMinutes: 15,
  spec: DEFAULT_GRID_SPEC,
};

const OFFICE = { start: localTime("09:00"), end: localTime("17:00") };
const WORKING_HOURS: WorkingHours = {
  0: [],
  1: [OFFICE],
  2: [OFFICE],
  3: [OFFICE],
  4: [OFFICE],
  5: [OFFICE],
  6: [],
};

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

function item(overrides: Partial<CalendarItem> & Pick<CalendarItem, "id">): CalendarItem {
  return {
    blockId: overrides.id,
    kind: "event",
    title: "Chemistry lecture",
    description: null,
    startAt: instant("2026-09-08T13:00:00.000Z"),
    endAt: instant("2026-09-08T14:00:00.000Z"),
    allDay: false,
    ownColor: null,
    color: "slate",
    completedAt: null,
    occurrence: null,
    work: null,
    habitId: null,
    habitRecordable: false,
    ...overrides,
  };
}

const ESSAY = planTask({
  id: "task-essay",
  title: "History essay",
  estimatedMinutes: 120,
  dueDate: localDate("2026-09-11"),
  projectName: "History 210",
  projectColor: "amber",
  scheduledOutsideMinutes: 30,
});

const HOMEWORK = planTask({
  id: "task-homework",
  title: "Statistics homework",
  estimatedMinutes: 45,
});
const LAB = planTask({ id: "task-lab", title: "Lab report", dueDate: localDate("2026-09-04") });

const PLAN: PlanningData = {
  overdue: [LAB],
  dueInRange: [ESSAY],
  unscheduled: [HOMEWORK],
  habits: [],
  weeklyGoals: [],
  workingHours: WORKING_HOURS,
  focusWindows: [],
};

describe("commitmentsOf", () => {
  it("carries a work block's task context onto the commitment", () => {
    const work = item({
      id: "block-1",
      kind: "work",
      title: "History essay",
      completedAt: instant("2026-09-08T14:00:00.000Z"),
      work: {
        taskId: "task-essay",
        taskTitle: "History essay",
        taskCompletedAt: instant("2026-09-08T15:00:00.000Z"),
        taskDueDate: localDate("2026-09-11"),
        taskEstimatedMinutes: 120,
        blockCount: 2,
        completesTask: false,
      },
    });

    expect(commitmentsOf([work])).toEqual<Commitment[]>([
      {
        id: "block-1",
        kind: "work",
        title: "History essay",
        startAt: work.startAt,
        endAt: work.endAt,
        allDay: false,
        completedAt: work.completedAt,
        taskId: "task-essay",
        taskDueDate: localDate("2026-09-11"),
        taskCompletedAt: instant("2026-09-08T15:00:00.000Z"),
      },
    ]);
  });

  it("gives an event no task fields, and keeps an all-day item as all-day", () => {
    const [event, birthday] = commitmentsOf([
      item({ id: "event-1" }),
      item({ id: "event-2", title: "Birthday", allDay: true }),
    ]);

    expect(event).toMatchObject({ taskId: null, taskDueDate: null, taskCompletedAt: null });
    expect(birthday?.allDay).toBe(true);
  });

  it("keeps the board's order — one commitment per item", () => {
    const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
    expect(commitmentsOf(items).map((commitment) => commitment.id)).toEqual(["a", "b", "c"]);
  });
});

describe("planningTaskOf", () => {
  it("projects exactly the fields the scheduler reads", () => {
    expect(planningTaskOf(ESSAY)).toEqual({
      id: "task-essay",
      title: "History essay",
      estimatedMinutes: 120,
      dueDate: "2026-09-11",
      scheduledOutsideMinutes: 30,
    });
  });
});

describe("taskBlockMinutes", () => {
  it("is the estimate when there is one, and the shared fallback when there is not", () => {
    expect(taskBlockMinutes(HOMEWORK)).toBe(45);
    expect(taskBlockMinutes(LAB)).toBe(DEFAULT_TASK_BLOCK_MINUTES);
  });

  it("never proposes a block shorter than the grid's minimum", () => {
    // A five-minute estimate is a real estimate, but a five-minute block is one
    // the editor and a resize both refuse; every route — drop, Find Time, the
    // manual dialog — seeds the same floor.
    expect(taskBlockMinutes({ ...HOMEWORK, estimatedMinutes: 5 })).toBe(MIN_BLOCK_MINUTES);
    expect(taskBlockMinutes({ ...HOMEWORK, estimatedMinutes: 10 })).toBe(MIN_BLOCK_MINUTES);
    expect(taskBlockMinutes({ ...HOMEWORK, estimatedMinutes: MIN_BLOCK_MINUTES })).toBe(
      MIN_BLOCK_MINUTES,
    );
  });
});

describe("liveSections", () => {
  it("passes the server's sections through when nothing on the board changes them", () => {
    expect(liveSections(PLAN, [])).toEqual({
      overdue: [LAB],
      dueInRange: [ESSAY],
      unscheduled: [HOMEWORK],
    });
  });

  it("drops an unscheduled task as soon as the board holds a block for it", () => {
    const commitments = commitmentsOf([
      item({
        id: "optimistic-1",
        kind: "work",
        work: {
          taskId: "task-homework",
          taskTitle: "Statistics homework",
          taskCompletedAt: null,
          taskDueDate: null,
          taskEstimatedMinutes: 45,
          blockCount: 0,
          completesTask: false,
        },
      }),
    ]);

    expect(liveSections(PLAN, commitments).unscheduled).toEqual([]);
  });

  it("leaves OVERDUE and DUE THIS WEEK alone — a block does not change a deadline", () => {
    const commitments = commitmentsOf([
      item({
        id: "block-essay",
        kind: "work",
        work: {
          taskId: "task-essay",
          taskTitle: "History essay",
          taskCompletedAt: null,
          taskDueDate: localDate("2026-09-11"),
          taskEstimatedMinutes: 120,
          blockCount: 1,
          completesTask: true,
        },
      }),
    ]);

    const sections = liveSections(PLAN, commitments);
    expect(sections.dueInRange).toEqual([ESSAY]);
    expect(sections.overdue).toEqual([LAB]);
  });

  it("ignores events and habit blocks when deciding what is scheduled", () => {
    const commitments = commitmentsOf([item({ id: "event-1" })]);
    expect(liveSections(PLAN, commitments).unscheduled).toEqual([HOMEWORK]);
  });
});

describe("planningTasksOf", () => {
  it("lists every task once, in section order", () => {
    expect(planningTasksOf(PLAN).map((task) => task.id)).toEqual([
      "task-lab",
      "task-essay",
      "task-homework",
    ]);
  });

  it("deduplicates a task that appears in more than one section", () => {
    const plan: PlanningData = { ...PLAN, unscheduled: [HOMEWORK, ESSAY] };
    expect(planningTasksOf(plan).map((task) => task.id)).toEqual([
      "task-lab",
      "task-essay",
      "task-homework",
    ]);
  });
});

describe("planningContextOf", () => {
  it("takes the timezone from the settings and the windows from the plan", () => {
    expect(planningContextOf(PLAN, SETTINGS, DAYS, TODAY)).toEqual({
      timezone: "America/New_York",
      workingHours: WORKING_HOURS,
      focusWindows: [],
      days: DAYS,
      today: TODAY,
    });
  });
});
