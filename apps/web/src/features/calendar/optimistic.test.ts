import { describe, expect, it } from "vitest";

import { intervalOfSlot } from "@momentum/core/scheduling";
import { durationMinutes, ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { IanaTimeZone } from "@momentum/core/types";

import {
  applyPatch,
  optimisticEvent,
  optimisticWorkBlock,
  type CalendarPatch,
} from "@/features/calendar/optimistic";
import type { CalendarItem, DaySpan, PlanTask } from "@/features/calendar/types";

const TZ: IanaTimeZone = ianaTimeZone("America/New_York");
const ID = "3f1a2b6c-9d4e-4a7b-8c5d-1e2f3a4b5c6d";

const TASK: PlanTask = {
  id: "8a7b6c5d-4e3f-4a2b-9c8d-7e6f5a4b3c2d",
  title: "History essay",
  priority: 4,
  estimatedMinutes: 120,
  dueDate: null,
  projectName: null,
  projectColor: null,
  scheduledOutsideMinutes: 0,
};

const WORK: NonNullable<CalendarItem["work"]> = {
  taskId: TASK.id,
  taskTitle: TASK.title,
  taskCompletedAt: instant("2026-09-07T15:00:00.000Z"),
  taskDueDate: null,
  taskEstimatedMinutes: 120,
  blockCount: 2,
  completesTask: false,
};

function workItem(id: string, overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id,
    blockId: id,
    kind: "work",
    title: TASK.title,
    description: null,
    startAt: instant("2026-09-07T13:00:00.000Z"),
    endAt: instant("2026-09-07T14:00:00.000Z"),
    allDay: false,
    ownColor: null,
    color: "slate",
    completedAt: null,
    occurrence: null,
    work: WORK,
    habitId: null,
    habitRecordable: false,
    ...overrides,
  };
}

describe("the wall-clock span an optimistic row is built from", () => {
  // 02:00–03:00 does not exist on 2026-03-08 in New York. 02:30–03:00 resolves
  // to 03:30 and 03:00 via `fromLocal`, i.e. inverted; the server keeps the drawn length.
  const GAP_SPAN: DaySpan = {
    date: localDate("2026-03-08"),
    startMinutes: 150,
    endMinutes: 180,
  };

  it("resolves a span straddling a spring-forward gap the way the server does", () => {
    const block = optimisticWorkBlock({ id: ID, task: TASK, span: GAP_SPAN, timezone: TZ });
    const server = intervalOfSlot(GAP_SPAN, TZ);

    expect(block.startAt).toBe(server.startAt);
    expect(block.endAt).toBe(server.endAt);
    expect(block.startAt).toBe("2026-03-08T07:30:00.000Z");
    expect(block.endAt).toBe("2026-03-08T08:00:00.000Z");
    expect(durationMinutes(block.startAt, block.endAt)).toBe(30);
  });

  it("resolves the same span the same way through a create and through a move", () => {
    const created = optimisticEvent({
      id: ID,
      title: "Airport run",
      description: null,
      color: null,
      span: GAP_SPAN,
      timezone: TZ,
    });
    const [moved] = applyPatch(
      [workItem("block-1")],
      { kind: "reschedule", id: "block-1", span: GAP_SPAN },
      TZ,
    );

    expect(created.endAt > created.startAt).toBe(true);
    expect(moved?.startAt).toBe(created.startAt);
    expect(moved?.endAt).toBe(created.endAt);
  });
});

describe("the completion patch", () => {
  const REOPEN: CalendarPatch = {
    kind: "completion",
    id: "block-1",
    completed: false,
    alsoTask: true,
  };

  it("reopens the task on every block of it, not only the one that was toggled", () => {
    const items = [workItem("block-1"), workItem("block-2")];

    const next = applyPatch(items, REOPEN, TZ);

    expect(next[0]?.work?.taskCompletedAt).toBeNull();
    expect(next[1]?.work?.taskCompletedAt).toBeNull();
  });

  it("leaves a sibling's own completion alone", () => {
    const done = workItem("block-2", { completedAt: instant("2026-09-07T14:00:00.000Z") });
    const items = [workItem("block-1"), done];

    const next = applyPatch(items, REOPEN, TZ);

    expect(next[0]?.completedAt).toBeNull();
    expect(next[1]?.completedAt).toBe(done.completedAt);
  });

  it("touches no other task's blocks", () => {
    const other = workItem("block-3", { work: { ...WORK, taskId: "another-task" } });
    const items = [workItem("block-1"), other];

    const next = applyPatch(items, REOPEN, TZ);

    expect(next[1]).toBe(other);
  });

  it("stays on the toggled block when the task is not part of the action", () => {
    const items = [workItem("block-1"), workItem("block-2")];

    const next = applyPatch(items, { ...REOPEN, alsoTask: false }, TZ);

    expect(next[0]?.completedAt).toBeNull();
    expect(next[0]?.work?.taskCompletedAt).toBe(items[0]?.work?.taskCompletedAt);
    expect(next[1]).toBe(items[1]);
  });
});

describe("the content patch", () => {
  const CONTENT = {
    kind: "content",
    id: "block-1",
    title: "Something else",
    description: "In the library",
    color: null,
  } as const satisfies CalendarPatch;

  it("never rewrites the title of a block that borrows its parent's", () => {
    for (const item of [workItem("block-1"), workItem("block-1", { kind: "habit" })]) {
      const [next] = applyPatch([item], CONTENT, TZ);

      expect(next?.title).toBe(TASK.title);
      expect(next?.description).toBe("In the library");
    }
  });

  it("takes the edited title on an event, which owns one", () => {
    const event = workItem("block-1", { kind: "event", title: "Chemistry lecture", work: null });

    const [next] = applyPatch([event], CONTENT, TZ);

    expect(next?.title).toBe("Something else");
  });
});
