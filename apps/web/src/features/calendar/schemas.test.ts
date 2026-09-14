import { describe, expect, it } from "vitest";

import {
  createBlockInput,
  deleteOccurrenceInput,
  rescheduleBlockInput,
  rescheduleOccurrenceInput,
  scheduleTaskInput,
  setBlockCompletionInput,
  updateBlockInput,
} from "@/features/calendar/schemas";

const ID = "3f1a2b6c-9d4e-4a7b-8c5d-1e2f3a4b5c6d";
const OTHER_ID = "8a7b6c5d-4e3f-4a2b-9c8d-7e6f5a4b3c2d";

function span(overrides: Record<string, unknown> = {}) {
  return { date: "2026-09-07", startMinutes: 540, endMinutes: 600, ...overrides };
}

describe("createBlockInput", () => {
  it("accepts a well-formed event and brands its date", () => {
    const parsed = createBlockInput.safeParse({
      id: ID,
      kind: "event",
      title: "Statistics lecture",
      description: null,
      color: "blue",
      ...span(),
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.date).toBe("2026-09-07");
  });

  it("trims the title and refuses one that is only whitespace", () => {
    const trimmed = createBlockInput.safeParse({
      id: ID,
      kind: "event",
      title: "  Dentist  ",
      description: null,
      color: null,
      ...span(),
    });
    expect(trimmed.success && trimmed.data.title).toBe("Dentist");

    const blank = createBlockInput.safeParse({
      id: ID,
      kind: "event",
      title: "   ",
      description: null,
      color: null,
      ...span(),
    });
    expect(blank.success).toBe(false);
    expect(fieldsOf(blank)).toContain("title");
  });

  it("refuses a kind Phase 3 cannot create from the grid", () => {
    for (const kind of ["work", "habit"]) {
      const parsed = createBlockInput.safeParse({
        id: ID,
        kind,
        title: "Nope",
        description: null,
        color: null,
        ...span(),
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("refuses a colour outside the palette", () => {
    const parsed = createBlockInput.safeParse({
      id: ID,
      kind: "event",
      title: "Lecture",
      description: null,
      color: "chartreuse",
      ...span(),
    });
    expect(parsed.success).toBe(false);
    expect(fieldsOf(parsed)).toContain("color");
  });

  it("refuses an id that is not a UUID", () => {
    const parsed = createBlockInput.safeParse({
      id: "block-1",
      kind: "event",
      title: "Lecture",
      description: null,
      color: null,
      ...span(),
    });
    expect(parsed.success).toBe(false);
    expect(fieldsOf(parsed)).toContain("id");
  });
});

describe("spans", () => {
  it("refuses an end that is not after its start", () => {
    for (const bad of [span({ endMinutes: 540 }), span({ endMinutes: 480 })]) {
      const parsed = rescheduleBlockInput.safeParse({ id: ID, ...bad });
      expect(parsed.success).toBe(false);
      expect(fieldsOf(parsed)).toContain("endMinutes");
    }
  });

  it("accepts a span that ends exactly at midnight", () => {
    // 1440 is the bottom of the grid; `clampSpan` produces it.
    const parsed = rescheduleBlockInput.safeParse({
      id: ID,
      ...span({ startMinutes: 1380, endMinutes: 1440 }),
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a start outside the day the user pointed at", () => {
    for (const bad of [span({ startMinutes: -15 }), span({ startMinutes: 1455 })]) {
      expect(rescheduleBlockInput.safeParse({ id: ID, ...bad }).success).toBe(false);
    }
  });

  it("accepts an end past midnight, because a block may cross one", () => {
    // 23:30 to 00:30 is 1410 to 1470 from its own midnight, as `spanOf` returns it.
    const crossing = { ...span({ startMinutes: 1410 }), endMinutes: 1470 };
    expect(rescheduleBlockInput.safeParse({ id: ID, ...crossing }).success).toBe(true);
  });

  it("refuses an end more than a day past the start", () => {
    const absurd = { ...span({ startMinutes: 0 }), endMinutes: 2881 };
    expect(rescheduleBlockInput.safeParse({ id: ID, ...absurd }).success).toBe(false);
  });

  it("refuses fractional minutes", () => {
    const parsed = rescheduleBlockInput.safeParse({ id: ID, ...span({ startMinutes: 540.5 }) });
    expect(parsed.success).toBe(false);
  });

  it("refuses a date that is not YYYY-MM-DD", () => {
    for (const date of ["7 September 2026", "2026-9-7", "2026-13-01", "2026-02-30", ""]) {
      const parsed = rescheduleBlockInput.safeParse({ id: ID, ...span({ date }) });
      expect(parsed.success).toBe(false);
      expect(fieldsOf(parsed)).toContain("date");
    }
  });
});

describe("scheduleTaskInput", () => {
  it("carries the new block's id and the task it reserves time for", () => {
    const parsed = scheduleTaskInput.safeParse({ id: ID, taskId: OTHER_ID, ...span() });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.taskId).toBe(OTHER_ID);
  });

  it("refuses a drop with no task", () => {
    const parsed = scheduleTaskInput.safeParse({ id: ID, ...span() });
    expect(parsed.success).toBe(false);
    expect(fieldsOf(parsed)).toContain("taskId");
  });
});

describe("setBlockCompletionInput", () => {
  it("defaults both task flags to false", () => {
    const parsed = setBlockCompletionInput.safeParse({ id: ID, completed: true });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.alsoCompleteTask).toBe(false);
    expect(parsed.success && parsed.data.alsoUncompleteTask).toBe(false);
  });

  it("refuses a completed flag that is not a boolean", () => {
    expect(setBlockCompletionInput.safeParse({ id: ID, completed: "yes" }).success).toBe(false);
  });
});

describe("occurrences", () => {
  it("keeps the occurrence's own date apart from the date it moves to", () => {
    const parsed = rescheduleOccurrenceInput.safeParse({
      seriesId: ID,
      occurrenceDate: "2026-09-08",
      ...span({ date: "2026-09-10" }),
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.occurrenceDate).toBe("2026-09-08");
    expect(parsed.success && parsed.data.date).toBe("2026-09-10");
  });

  it("needs both the series and the occurrence to cancel one", () => {
    expect(deleteOccurrenceInput.safeParse({ seriesId: ID }).success).toBe(false);
    expect(deleteOccurrenceInput.safeParse({ occurrenceDate: "2026-09-08" }).success).toBe(false);
    expect(
      deleteOccurrenceInput.safeParse({ seriesId: ID, occurrenceDate: "2026-09-08" }).success,
    ).toBe(true);
  });
});

describe("updateBlockInput", () => {
  it("has no way to express a time or a completion", () => {
    const parsed = updateBlockInput.safeParse({
      id: ID,
      title: "Renamed",
      description: null,
      color: null,
      startMinutes: 0,
      completedAt: "2026-09-07T13:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
    // Unknown keys are stripped, so a guarded column cannot be smuggled through.
    expect(parsed.success && "startMinutes" in parsed.data).toBe(false);
    expect(parsed.success && "completedAt" in parsed.data).toBe(false);
  });

  it("accepts a save that sends no title, for a block that borrows its parent's", () => {
    const parsed = updateBlockInput.safeParse({ id: ID, description: null, color: "amber" });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.title).toBeUndefined();
  });

  it("still refuses an empty title from the one kind that owns one", () => {
    const parsed = updateBlockInput.safeParse({
      id: ID,
      title: "   ",
      description: null,
      color: null,
    });

    expect(parsed.success).toBe(false);
    expect(fieldsOf(parsed)).toContain("title");
  });
});

/** The field paths an unsuccessful parse complained about. */
function fieldsOf(result: {
  success: boolean;
  error?: { issues: readonly { path: readonly PropertyKey[] }[] };
}) {
  return (result.error?.issues ?? []).map((issue) => issue.path.map(String).join("."));
}

describe("recurrence", () => {
  const event = {
    id: ID,
    kind: "event",
    title: "Statistics lecture",
    description: null,
    color: null,
  };

  it("accepts a weekly rule, deduplicating and sorting its days, and brands its end date", () => {
    const parsed = createBlockInput.safeParse({
      ...event,
      ...span(),
      recurrence: {
        freq: "weekly",
        interval: 2,
        byWeekday: [3, 1, 1],
        until: "2026-12-11",
        count: null,
      },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.recurrence).toEqual({
      freq: "weekly",
      interval: 2,
      byWeekday: [1, 3],
      until: "2026-12-11",
      count: null,
    });
  });

  it("defaults to no rule", () => {
    const parsed = createBlockInput.safeParse({ ...event, ...span() });
    expect(parsed.success && parsed.data.recurrence).toBeNull();
  });

  it("refuses a rule that ends before the event starts", () => {
    const parsed = createBlockInput.safeParse({
      ...event,
      ...span(),
      recurrence: { freq: "daily", interval: 1, byWeekday: null, until: "2026-09-01", count: null },
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses both an end date and a count, and weekdays on a daily rule", () => {
    expect(
      createBlockInput.safeParse({
        ...event,
        ...span(),
        recurrence: { freq: "daily", interval: 1, byWeekday: null, until: "2026-12-11", count: 3 },
      }).success,
    ).toBe(false);
    expect(
      createBlockInput.safeParse({
        ...event,
        ...span(),
        recurrence: { freq: "daily", interval: 1, byWeekday: [1], until: null, count: null },
      }).success,
    ).toBe(false);
  });

  it("bounds the interval, the count and the day numbers", () => {
    const rule = { freq: "weekly", interval: 1, byWeekday: null, until: null, count: null };
    expect(
      createBlockInput.safeParse({ ...event, ...span(), recurrence: { ...rule, interval: 0 } })
        .success,
    ).toBe(false);
    expect(
      createBlockInput.safeParse({ ...event, ...span(), recurrence: { ...rule, interval: 53 } })
        .success,
    ).toBe(false);
    expect(
      createBlockInput.safeParse({ ...event, ...span(), recurrence: { ...rule, count: 366 } })
        .success,
    ).toBe(false);
    expect(
      createBlockInput.safeParse({ ...event, ...span(), recurrence: { ...rule, byWeekday: [7] } })
        .success,
    ).toBe(false);
    expect(
      createBlockInput.safeParse({ ...event, ...span(), recurrence: { ...rule, byWeekday: [] } })
        .success,
    ).toBe(false);
  });

  it("lets an update leave the rule alone, clear it, or set it", () => {
    const base = { id: ID, description: null, color: null };
    expect(
      updateBlockInput.safeParse(base).success && "recurrence" in updateBlockInput.parse(base),
    ).toBe(false);
    expect(updateBlockInput.parse({ ...base, recurrence: null }).recurrence).toBeNull();
    expect(
      updateBlockInput.parse({
        ...base,
        recurrence: { freq: "daily", interval: 3, byWeekday: null, until: null, count: 4 },
      }).recurrence,
    ).toEqual({ freq: "daily", interval: 3, byWeekday: null, until: null, count: 4 });
  });
});
