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
  TodayHabit,
  TodayItem,
  TodayPageData,
  TodayProject,
  TodayRisk,
  TodayTask,
} from "@/features/today/types";

/**
 * The Today page's domain logic: what the day looks like, what to do next, and
 * what is at risk.
 *
 * Pure and framework-free, in the feature rather than in `@momentum/core`
 * because it is composition over shapes the *application* resolves — the
 * calendar's `CalendarItem`, the conflict engine's warnings, the page's own
 * task rows — and `@momentum/core` may not depend on any of them
 * (docs/ARCHITECTURE.md §2). It follows `features/calendar/projection.ts` and
 * `features/planning/live.ts`, which exist for the same reason.
 *
 * Nothing here reads a clock. `now` is a parameter everywhere it is needed, so
 * the server render, the first client render and every tick afterwards all run
 * the same function over the same data and can only disagree about the instant
 * (Domain Rules 4, 5).
 */

/** Wall clock, not elapsed time: the bottom edge of a day column. */
const MINUTES_PER_DAY: Minutes = 1440;

/* -------------------------------------------------------------------------- */
/* The greeting                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Morning until noon, afternoon until 18:00, evening after that — resolved
 * from wall-clock minutes in the profile timezone, never from the server's.
 *
 * It is decided once, on the server, and does not change under an open tab. A
 * greeting that flipped at noon would be a re-render nobody asked for, and the
 * page already refreshes itself at local midnight, which is the boundary that
 * actually matters.
 */
export function dayPartOf(minutesFromMidnight: Minutes): DayPart {
  if (minutesFromMidnight < 12 * 60) return "morning";
  if (minutesFromMidnight < 18 * 60) return "afternoon";
  return "evening";
}

/* -------------------------------------------------------------------------- */
/* The timeline                                                               */
/* -------------------------------------------------------------------------- */

/** A calendar item together with the project context Today shows beside it. */
export interface TimelineSource {
  item: CalendarItem;
  project: TodayProject | null;
}

/**
 * Today's slice of every block that touches it, in chronological order.
 *
 * A block is placed by the segment `splitByLocalDay` gives it for *today*, so a
 * block that began at 23:00 yesterday starts the list at 00:00 and one that
 * runs past midnight ends it at 24:00 — both correct, and both marked as
 * continuing (Domain Rule 4). A block with no segment on today is not today's
 * and is dropped; that is what makes the same read serve the conflict engine's
 * wider range without leaking tomorrow onto the page.
 *
 * `durationMinutes` is the *elapsed* length of the whole block, which is what a
 * focus session is offered for. The two differ for a block that crosses a local
 * midnight or a DST transition, and confusing them is the defect Phases 3 and 4
 * each found once (docs/ARCHITECTURE.md §10).
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
      // A zero-length or inverted span produces no segments at all. It still
      // belongs to today if that is the date it starts on; drawing it as a
      // point is better than silently losing a row the calendar shows.
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

/**
 * Whether an item is finished as far as the day is concerned.
 *
 * Two ways: the block itself was completed, or its task was completed
 * elsewhere. Domain Rule 13 is explicit that an incomplete future block of a
 * completed task stays on the calendar, renders as settled, is free time to the
 * capacity maths — and is skipped by Next Up. This is that rule, in one place.
 */
export function isSettled(entry: TodayItem): boolean {
  return entry.item.completedAt !== null || entry.item.work?.taskCompletedAt != null;
}

/** How many of today's blocks have been marked done. */
export function completedBlockCount(timeline: readonly TodayItem[]): number {
  return timeline.filter((entry) => entry.item.completedAt !== null).length;
}

/* -------------------------------------------------------------------------- */
/* Next up                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The single most important answer on the page, and it always exists.
 *
 * In order:
 *
 * 1. **The next incomplete scheduled item by the current time.** Candidates are
 *    the timed blocks that have not been settled and have not yet ended, so a
 *    block already running is the earliest of them and the mid-block state
 *    falls out rather than being special-cased. An all-day item is never
 *    "next": it names no time to start at.
 * 2. **Nothing scheduled — what is due soonest.** `candidates` arrives ordered
 *    by deadline, so the first open one is the answer.
 * 3. **Everything done**, when the day held work and none of it is left.
 * 4. **An open day**, when it held none.
 *
 * A block that ended without being marked done is deliberately not "next": it
 * is in the past, and the timeline is where it gets ticked. Offering it as the
 * next thing to start would be describing the schedule rather than the day.
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
  return completed > 0 ? { kind: "done", completed } : { kind: "empty" };
}

/** Why this task and not another: a statement about its deadline. */
export function nextUpReasonFor(task: TodayTask, today: LocalDate): NextUpReason {
  if (task.dueDate === null) return "undated";
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "due-today";
  return "due-soon";
}

/* -------------------------------------------------------------------------- */
/* At risk                                                                    */
/* -------------------------------------------------------------------------- */

/** How many overdue rows the section shows before it offers a link instead. */
export const AT_RISK_OVERDUE_LIMIT = 3;

/**
 * The three things the spec says At Risk shows, assembled from the page as the
 * user currently sees it — which is what makes the section answer to the
 * optimistic overlay.
 *
 * Completing an overdue task removes its row in the same frame; completing the
 * task a shortfall was about removes the shortfall; completing either half of a
 * double booking removes the overlap, because a completed block occupies no
 * time (`occupiesTime`, Domain Rule 13) and the engine would not have raised it
 * on the next read either. A failed write rolls all of that back with the rest
 * of the overlay, because none of it is state — it is a function of the page.
 *
 * An empty result means the section is not rendered at all. That is a
 * requirement, not a nicety: a permanent "At Risk: nothing" panel is a place
 * for the eye to keep checking, which is the opposite of what it is for.
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
      // Narrowed by the filter above; the assertion-free form keeps the type
      // honest without weakening it.
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

  /*
   * One order, decided here rather than inherited from whatever order the
   * warnings arrived in: overdue first, then a deadline that cannot be met with
   * the time open before it, then a double booking. It is a rough ordering by
   * how much of the day is already spent — a passed deadline is spent, a
   * shortfall is about to be, an overlap is a decision still to make — and
   * fixing it here is what keeps a row from jumping between renders.
   */
  return [...risks, ...overlaps];
}

/** Whole days between two local dates, through the one module that owns date maths. */
function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.max(0, diffDays(from, to));
}

/* -------------------------------------------------------------------------- */
/* Habits                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The habits today asks something of.
 *
 * Two kinds qualify. A **per-day** habit is shown on the dates its schedule
 * names — every day, or the weekdays it was given. A **per-week** habit
 * ("three times a week, any days") names no day at all, so it is shown on every
 * day of a week it has not yet met, and disappears once the week is met: today
 * is one of the days it could be done on, and `@momentum/core/habits` is
 * explicit that inventing a day for it would let the product say a day was
 * skipped that the user never chose.
 *
 * Archived habits are absent. They are not being kept, and a row for one would
 * be asking for something nobody asked for.
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
