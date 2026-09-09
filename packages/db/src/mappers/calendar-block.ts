import { ianaTimeZone, isLocalDate, localDate } from "@momentum/core/time";
import {
  PROJECT_COLORS,
  RECURRENCE_FREQUENCIES,
  WEEKDAYS,
  type CalendarBlock,
  type EventBlock,
  type HabitBlock,
  type ProjectColor,
  type Recurrence,
  type RecurrenceFrequency,
  type Weekday,
  type WorkBlock,
} from "@momentum/core/types";

import type { Json, Row } from "../types";
import { isJsonObject, oneOf, toInstant, toInstantOrNull, toLocalDateOrNull } from "./scalars";

/**
 * One table, three domain shapes. The `kind` discriminator plus the per-kind
 * check constraints mean a row always has exactly the foreign key its kind
 * requires; the mapper still asserts it, because a violated invariant is a
 * schema bug that should surface here rather than as `undefined` in the grid.
 */

export function parseRecurrence(value: Json): Recurrence | null {
  if (!isJsonObject(value)) return null;

  const { freq, interval, byWeekday, until, count, timezone } = value;

  if (typeof freq !== "string" || typeof timezone !== "string") return null;
  if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 1) return null;

  return {
    freq: oneOf<RecurrenceFrequency>(RECURRENCE_FREQUENCIES, freq, "recurrence.freq"),
    interval,
    byWeekday: Array.isArray(byWeekday)
      ? byWeekday.map((day) => oneOf<Weekday>(WEEKDAYS, day, "recurrence.byWeekday"))
      : null,
    until: typeof until === "string" && isLocalDate(until) ? localDate(until) : null,
    count: typeof count === "number" && Number.isInteger(count) && count >= 1 ? count : null,
    timezone: ianaTimeZone(timezone),
  };
}

function base(row: Row<"calendar_blocks">) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    startAt: toInstant(row.start_at),
    endAt: toInstant(row.end_at),
    allDay: row.all_day,
    color:
      row.color === null ? null : oneOf<ProjectColor>(PROJECT_COLORS, row.color, "blocks.color"),
    completedAt: toInstantOrNull(row.completed_at),
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}

export function rowToCalendarBlock(row: Row<"calendar_blocks">): CalendarBlock {
  switch (row.kind) {
    case "work": {
      if (row.task_id === null) {
        throw new TypeError(`calendar_blocks ${row.id}: a work block must reference a task`);
      }
      const block: WorkBlock = {
        ...base(row),
        kind: "work",
        taskId: row.task_id,
        habitId: null,
        recurrence: null,
        seriesId: null,
        occurrenceDate: null,
        cancelled: false,
      };
      return block;
    }
    case "habit": {
      if (row.habit_id === null) {
        throw new TypeError(`calendar_blocks ${row.id}: a habit block must reference a habit`);
      }
      const block: HabitBlock = {
        ...base(row),
        kind: "habit",
        taskId: null,
        habitId: row.habit_id,
        recurrence: null,
        seriesId: null,
        occurrenceDate: null,
        cancelled: false,
      };
      return block;
    }
    case "event": {
      const block: EventBlock = {
        ...base(row),
        kind: "event",
        taskId: null,
        habitId: null,
        recurrence: row.recurrence === null ? null : parseRecurrence(row.recurrence),
        seriesId: row.series_id,
        occurrenceDate: toLocalDateOrNull(row.occurrence_date),
        cancelled: row.cancelled,
      };
      return block;
    }
    default:
      throw new TypeError(`calendar_blocks ${row.id}: unknown kind ${JSON.stringify(row.kind)}`);
  }
}

/** Narrowing helper for callers that have already filtered by kind. */
export function rowToEventBlock(row: Row<"calendar_blocks">): EventBlock {
  const block = rowToCalendarBlock(row);
  if (block.kind !== "event") {
    throw new TypeError(`calendar_blocks ${row.id}: expected an event, got ${block.kind}`);
  }
  return block;
}
