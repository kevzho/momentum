import { cadenceOf, habitDay, isScheduledOn, weekProgress } from "@momentum/core/habits";
import { diffDays, durationMinutes, localDateOf, splitByLocalDay } from "@momentum/core/time";
import type {
  Habit,
  HabitCompletion,
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
} from "@momentum/core/types";

import type { CalendarItem } from "@/features/calendar/types";
import type {
  DayPart,
  NextUp,
  NextUpReason,
  TimelineState,
  TodayGuide,
  TodayHabit,
  TodayItem,
  TodayPageData,
  TodayProject,
  TodayRisk,
  TodayTask,
} from "@/features/today/types";

/**
 * The Today page's domain logic, pure and framework-free. It lives in the
 * feature because it composes application shapes `@momentum/core` may not
 * depend on. Nothing here reads a clock: `now` is always a parameter.
 */

/** Wall clock, not elapsed time: the bottom edge of a day column. */
const MINUTES_PER_DAY: Minutes = 1440;

/**
 * Morning until noon, afternoon until 18:00, evening after, from wall-clock
 * minutes in the profile timezone. Decided once on the server; it does not
 * flip under an open tab.
 */
export function dayPartOf(minutesFromMidnight: Minutes): DayPart {
  if (minutesFromMidnight < 12 * 60) return "morning";
  if (minutesFromMidnight < 18 * 60) return "afternoon";
  return "evening";
}

/**
 * The next action for an account with an open day. A brand-new account is
 * pointed at capture; one with tasks and no slot anywhere at scheduling.
 * Once anything has ever been scheduled the empty states say only that
 * today is open.
 */
export function todayGuide(
  data: Pick<TodayPageData, "openTaskCount" | "hasScheduledWork">,
): TodayGuide {
  if (data.hasScheduledWork) return null;
  return data.openTaskCount === 0 ? "capture" : "schedule";
}

/** A calendar item together with the project context Today shows beside it. */
export interface TimelineSource {
  item: CalendarItem;
  project: TodayProject | null;
}

/**
 * Today's slice of every block that touches it, in chronological order. Rows
 * are placed by today's `splitByLocalDay` segment, clipped at 00:00 and 24:00;
 * a block with no segment on today is dropped. `durationMinutes` is the elapsed
 * length of the whole block, which differs from the wall-clock span across a
 * local midnight or a DST transition.
 */
export function buildTimeline(
  sources: readonly TimelineSource[],
  today: LocalDate,
  timezone: IanaTimeZone,
): TodayItem[] {
  const entries: TodayItem[] = [];

  for (const source of sources) {
    const { item } = source;
    const segments = splitByLocalDay(item.startAt, item.endAt, timezone);
    const index = segments.findIndex((segment) => segment.date === today);

    if (index === -1) {
      // A zero-length or inverted span has no segments; it still belongs to
      // today if it starts on it, drawn as a point.
      if (segments.length > 0 || localDateOf(item.startAt, timezone) !== today) continue;
      entries.push({
        item,
        startMinutes: 0,
        endMinutes: 0,
        durationMinutes: 0,
        startsBeforeToday: false,
        endsAfterToday: false,
        project: source.project,
      });
      continue;
    }

    const segment = segments[index];
    if (segment === undefined) continue;

    entries.push({
      item,
      startMinutes: item.allDay ? 0 : segment.startMinutes,
      endMinutes: item.allDay ? MINUTES_PER_DAY : segment.endMinutes,
      durationMinutes: durationMinutes(item.startAt, item.endAt),
      startsBeforeToday: index > 0,
      endsAfterToday: index < segments.length - 1,
      project: source.project,
    });
  }

  return entries.sort(compareEntries);
}

/**
 * All-day items first — they have no time and would otherwise claim 00:00 —
 * then by start, then by end, then by id so the order is total and stable.
 */
function compareEntries(a: TodayItem, b: TodayItem): number {
  if (a.item.allDay !== b.item.allDay) return a.item.allDay ? -1 : 1;
  return (
    a.startMinutes - b.startMinutes ||
    a.endMinutes - b.endMinutes ||
    compareStrings(a.item.id, b.item.id)
  );
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Past once it has ended, current while it is running, future until it starts. */
export function timelineStateOf(entry: TodayItem, now: Instant): TimelineState {
  if (entry.item.endAt <= now) return "past";
  if (entry.item.startAt <= now) return "current";
  return "future";
}

/** Finished as far as the day is concerned: the block was completed, or its task was completed elsewhere. */
export function isSettled(entry: TodayItem): boolean {
  return entry.item.completedAt !== null || entry.item.work?.taskCompletedAt != null;
}

/** How many of today's blocks have been marked done. */
export function completedBlockCount(timeline: readonly TodayItem[]): number {
  return timeline.filter((entry) => entry.item.completedAt !== null).length;
}

/**
 * In order: the next unsettled timed block that has not ended (a running block
 * is the earliest; all-day items are never "next"); else the first open
 * candidate, which arrive ordered by deadline; else "done" or "empty". A block
 * that ended unmarked is deliberately not "next".
 */
export function selectNextUp(page: TodayPageData, now: Instant): NextUp {
  const upcoming = page.timeline
    .filter((entry) => !entry.item.allDay && !isSettled(entry) && entry.item.endAt > now)
    .sort(compareEntries);

  const entry = upcoming[0];
  if (entry !== undefined) {
    return { kind: "block", entry, inProgress: entry.item.startAt <= now };
  }

  const task = page.candidates.find((candidate) => candidate.completedAt === null);
  if (task !== undefined) {
    return { kind: "task", task, reason: nextUpReasonFor(task, page.today) };
  }

  const completed = page.completedTasksToday + completedBlockCount(page.timeline);
  return completed > 0
    ? { kind: "done", completed }
    : { kind: "empty", openTasks: page.openTaskCount };
}

/** Why this task and not another: a statement about its deadline. */
export function nextUpReasonFor(task: TodayTask, today: LocalDate): NextUpReason {
  if (task.dueDate === null) return "undated";
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "due-today";
  return "due-soon";
}

/** How many overdue rows the section shows before it offers a link instead. */
export const AT_RISK_OVERDUE_LIMIT = 3;

/**
 * Derived from the page as currently shown, so the optimistic overlay clears a
 * row in the same frame: a completed task drops its overdue row and shortfall,
 * and a completed block drops its overlap (a completed block occupies no time).
 * An empty result means the section is not rendered at all.
 */
export function buildRisks(page: TodayPageData): TodayRisk[] {
  const completedTaskIds = new Set<string>();
  for (const task of [...page.overdue, ...page.tasks, ...page.candidates]) {
    if (task.completedAt !== null) completedTaskIds.add(task.id);
  }
  for (const entry of page.timeline) {
    if (entry.item.work?.taskCompletedAt != null) completedTaskIds.add(entry.item.work.taskId);
  }

  const completedItemIds = new Set(
    page.timeline.filter((entry) => entry.item.completedAt !== null).map((entry) => entry.item.id),
  );

  const risks: TodayRisk[] = page.overdue
    .filter((task) => task.completedAt === null && task.dueDate !== null)
    .map((task) => ({
      kind: "overdue" as const,
      task,
      // Narrowed by the filter above, without an assertion.
      dueDate: task.dueDate ?? page.today,
      daysOverdue: daysBetween(task.dueDate ?? page.today, page.today),
    }));

  const overlaps: TodayRisk[] = [];
  for (const warning of page.warnings) {
    if (warning.kind === "insufficient-time") {
      if (!completedTaskIds.has(warning.taskId)) risks.push({ kind: "insufficient-time", warning });
    } else if (
      !completedItemIds.has(warning.first.id) &&
      !completedItemIds.has(warning.second.id)
    ) {
      overlaps.push({ kind: "overlap", warning });
    }
  }

  // Fixed order — overdue, then shortfall, then overlap — so a row never jumps between renders.
  return [...risks, ...overlaps];
}

/** Whole days between two local dates, never negative. */
function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.max(0, diffDays(from, to));
}

/**
 * The habits today asks something of: a per-day habit on the dates its
 * schedule names, and a per-week habit (which names no day) on every day of a
 * week it has not yet met. Archived habits are absent.
 */
export function habitsForToday(
  habits: readonly Habit[],
  completions: readonly HabitCompletion[],
  week: readonly LocalDate[],
  today: LocalDate,
): TodayHabit[] {
  const rows: TodayHabit[] = [];

  for (const habit of habits) {
    if (habit.archivedAt !== null) continue;

    const own = completions.filter((completion) => completion.habitId === habit.id);
    const progress = weekProgress(habit, week, own);
    const perWeek = cadenceOf(habit.frequencyType) === "per-week";

    if (!perWeek && !isScheduledOn(habit, today)) continue;
    if (perWeek && progress.fraction >= 1) continue;

    const amount = own.find((completion) => completion.completionDate === today)?.amount ?? 0;
    rows.push({ habit, day: habitDay(habit, today, amount, today), progress, completions: own });
  }

  return rows;
}
