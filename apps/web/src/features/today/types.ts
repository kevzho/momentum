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
 * What `/today` renders, resolved on the server in the profile timezone. The
 * client reads a clock only to decide what is past, current and next.
 */

/** Where an item sits relative to now. Never signalled by colour alone. */
export type TimelineState = "past" | "current" | "future";

/**
 * One thing on today's timeline, composing the calendar's resolved
 * `CalendarItem`. `startMinutes`/`endMinutes` are wall clock on today, clipped
 * at both ends; `durationMinutes` is the elapsed length of the whole block,
 * which differs across a local midnight or a DST transition.
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

/**
 * A task Today can show or complete. `scheduledMinutes` is summed across all
 * of the task's work blocks, not only today's. `completedAt` exists for the
 * optimistic overlay; the server never sends a completed task here.
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

/** A habit today asks something of. `completions` is its week, carried so the optimistic overlay can recompute. */
export interface TodayHabit {
  habit: Habit;
  /** Today's state: met · partial · open · ahead · free. There is no "missed". */
  day: HabitDay;
  /** Progress over the user's current week. */
  progress: HabitProgress;
  completions: readonly HabitCompletion[];
}

/** An overdue task, a deadline without enough open time before it, or a calendar conflict. */
export type TodayRisk =
  | { kind: "overdue"; task: TodayTask; dueDate: LocalDate; daysOverdue: number }
  | { kind: "insufficient-time"; warning: InsufficientTimeWarning }
  | { kind: "overlap"; warning: OverlapWarning };

export type InsufficientTimeWarning = Extract<PlanningWarning, { kind: "insufficient-time" }>;
export type OverlapWarning = Extract<PlanningWarning, { kind: "overlap" }>;

/** Why a task is being offered when nothing is scheduled. */
export type NextUpReason = "overdue" | "due-today" | "due-soon" | "undated";

/** The answer to "what should I do next", which always exists. */
export type NextUp =
  | { kind: "block"; entry: TodayItem; inProgress: boolean }
  | { kind: "task"; task: TodayTask; reason: NextUpReason }
  | { kind: "done"; completed: number }
  /** `openTasks` is the account's open task count, for the empty state's sentence. */
  | { kind: "empty"; openTasks: number };

/** Which greeting the header opens with, resolved from the profile's clock. */
export type DayPart = "morning" | "afternoon" | "evening";

export interface TodayPageData {
  /** The instant the server rendered at; seeds every time-dependent decision until `useNow()` takes over. */
  serverNow: Instant;
  timezone: IanaTimeZone;
  /** "Today" in the profile timezone, resolved once per request. */
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
  /** Tasks completed today; read only by the everything-done state. */
  completedTasksToday: number;
  /** Engine warnings narrowed to the two kinds At Risk shows; overdue rows derive from `overdue` on the client. */
  warnings: readonly (InsufficientTimeWarning | OverlapWarning)[];
  /** Open, unarchived top-level tasks across every date, so an empty day can say what the account is missing. */
  openTaskCount: number;
  /** At least one work block exists somewhere, in any week. */
  hasScheduledWork: boolean;
}

/**
 * What an open day points at, decided from the account rather than the day:
 * capture when there is nothing to schedule, schedule when there is something
 * and no slot anywhere, and nothing special otherwise.
 */
export type TodayGuide = "capture" | "schedule" | null;
