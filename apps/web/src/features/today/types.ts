import type { HabitDay, HabitProgress } from "@momentum/core/habits";
import type { LevelProgress } from "@momentum/core/gamification";
import type { PlanningWarning } from "@momentum/core/scheduling";
import type {
  Habit,
  HabitCompletion,
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
  ProjectColor,
  TaskPriority,
  Uuid,
} from "@momentum/core/types";

import type { CalendarItem } from "@/features/calendar/types";
import type { QuestRow } from "@/features/gamification/types";

/**
 * What `/today` renders.
 *
 * The page answers four questions and carries nothing that answers none of them
 * (specs/09-today.md): what am I doing today, what should I do next, how am I
 * progressing today, is anything at risk. Every field below belongs to one of
 * the four, and the type is the place that claim is kept honest.
 *
 * The server resolves it in the profile timezone, once per request
 * (Domain Rule 4). The client island receives dates, instants and already
 * computed numbers; it reads a clock only to decide what is past, current and
 * next, which is the one thing that changes without a request.
 */

/* -------------------------------------------------------------------------- */
/* The timeline                                                               */
/* -------------------------------------------------------------------------- */

/** Where an item sits relative to now. Never signalled by colour alone. */
export type TimelineState = "past" | "current" | "future";

/**
 * One thing on today's timeline: an event, a task work block or a habit block.
 *
 * It composes `CalendarItem` rather than restating it. The calendar's read
 * already resolves a block's title from its parent, its colour, the completion
 * control's promise (`work.completesTask`) and whether a habit block's date is
 * one the database will record — all of which Today needs and none of which it
 * should compute a second way (docs/DOMAIN_RULES.md §19).
 *
 * The minutes are **wall clock on today**, clipped at both ends, so a block
 * that began at 23:00 yesterday and one that runs past midnight both place
 * correctly. `durationMinutes` is the *elapsed* length of the whole block,
 * which is what a focus session is offered for — the two differ for a block
 * that crosses a local midnight or a DST transition.
 */
export interface TodayItem {
  item: CalendarItem;
  startMinutes: Minutes;
  endMinutes: Minutes;
  durationMinutes: Minutes;
  /** The block started before today's local midnight. */
  startsBeforeToday: boolean;
  /** The block runs past today's local midnight. */
  endsAfterToday: boolean;
  /** The project of a work block's task; null for events, habits and unfiled tasks. */
  project: TodayProject | null;
}

export interface TodayProject {
  name: string;
  color: ProjectColor;
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A task Today can show or complete: the ones due today with no time reserved,
 * the overdue ones behind the At Risk section, and the fallback Next Up offers
 * when the day holds nothing scheduled.
 *
 * `scheduledMinutes` is summed across **all** of the task's work blocks, not
 * only today's, because "has time reserved" is a question about the task and
 * not about the day (Domain Rule 2). `completedAt` is here so the optimistic
 * overlay has somewhere to record a completion; the server never sends a
 * completed task in these lists.
 */
export interface TodayTask {
  id: Uuid;
  title: string;
  priority: TaskPriority;
  dueDate: LocalDate | null;
  estimatedMinutes: Minutes | null;
  scheduledMinutes: Minutes;
  project: TodayProject | null;
  completedAt: Instant | null;
}

/* -------------------------------------------------------------------------- */
/* Habits                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A habit today asks something of, with the row needed to complete it inline.
 *
 * `completions` is the habit's week, carried so the optimistic overlay can
 * re-run the same `@momentum/core/habits` functions the server ran rather than
 * nudging a displayed number — the identical arrangement `features/habits/
 * optimistic.ts` uses, and for the identical reason (docs/ARCHITECTURE.md §8).
 */
export interface TodayHabit {
  habit: Habit;
  /** Today's state: met · partial · open · ahead · free. There is no "missed". */
  day: HabitDay;
  /** Progress over the user's current week, which is what a per-week habit is measured on. */
  progress: HabitProgress;
  completions: readonly HabitCompletion[];
}

/* -------------------------------------------------------------------------- */
/* At risk                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The three things specs/09-today.md says the At Risk section shows, and
 * nothing else: an overdue task, a task due soon without enough time open
 * before its deadline, and a calendar conflict.
 *
 * The two warnings are `@momentum/core/scheduling`'s own, so the sentence a
 * user reads is the engine's — already neutral, already tested for the
 * vocabulary Domain Rule 7 forbids, and already keyed stably so a row does not
 * jump as the page refreshes.
 */
export type TodayRisk =
  | { kind: "overdue"; task: TodayTask; dueDate: LocalDate; daysOverdue: number }
  | { kind: "insufficient-time"; warning: InsufficientTimeWarning }
  | { kind: "overlap"; warning: OverlapWarning };

export type InsufficientTimeWarning = Extract<PlanningWarning, { kind: "insufficient-time" }>;
export type OverlapWarning = Extract<PlanningWarning, { kind: "overlap" }>;

/* -------------------------------------------------------------------------- */
/* Next up                                                                    */
/* -------------------------------------------------------------------------- */

/** Why a task is being offered when nothing is scheduled. */
export type NextUpReason = "overdue" | "due-today" | "due-soon" | "undated";

/**
 * The answer to "what should I do next", which always exists.
 *
 * Four shapes, because there are four genuinely different situations and a
 * component that received `null` would have to invent copy for three of them:
 * something is scheduled and still ahead; nothing is scheduled but something is
 * due; the day's work is finished; the day holds nothing at all.
 */
export type NextUp =
  | { kind: "block"; entry: TodayItem; inProgress: boolean }
  | { kind: "task"; task: TodayTask; reason: NextUpReason }
  | { kind: "done"; completed: number }
  | { kind: "empty" };

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

/** Which greeting the header opens with, resolved from the profile's clock. */
export type DayPart = "morning" | "afternoon" | "evening";

export interface TodayPageData {
  /**
   * The instant the server rendered at.
   *
   * It seeds every time-dependent decision so that the server's markup and the
   * first client render agree; `useNow()` takes over once mounted
   * (docs/ARCHITECTURE.md §10).
   */
  serverNow: Instant;
  timezone: IanaTimeZone;
  /** "Today" in the profile timezone, resolved once per request (Domain Rule 4). */
  today: LocalDate;
  /** The seven dates of the user's current week, in their week-start order. */
  week: readonly LocalDate[];
  dayPart: DayPart;
  /** What to call the user in the greeting; empty when the profile has no name. */
  displayName: string;

  /** Lifetime level and XP, plus what today has added to it. */
  level: LevelProgress;
  xpToday: number;

  timeline: readonly TodayItem[];
  /** Open tasks due today with no work block anywhere. */
  tasks: readonly TodayTask[];
  /** Open tasks whose deadline has passed. */
  overdue: readonly TodayTask[];
  /**
   * What Next Up offers when the day holds nothing scheduled, ordered by
   * deadline: overdue first, then today's, then the days after.
   */
  candidates: readonly TodayTask[];
  habits: readonly TodayHabit[];
  /** Today's quests only. The week's belong to /progress. */
  quests: readonly QuestRow[];
  /**
   * Tasks completed today, from the ledger's own sources.
   *
   * Only the everything-done state reads it, and only to say how much the day
   * added up to. It counts what was finished and never what was not
   * (Domain Rule 7).
   */
  completedTasksToday: number;
  /**
   * Conflict-engine warnings already narrowed to the two kinds At Risk shows.
   * Overdue tasks are not here: they are derived from `overdue` on the client
   * so that completing one removes its row in the same frame.
   */
  warnings: readonly (InsufficientTimeWarning | OverlapWarning)[];
}
