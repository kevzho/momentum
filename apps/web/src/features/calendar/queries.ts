import "server-only";

import { blocks, habits as habitsRepo, projects, tasks, weeklyGoals } from "@momentum/db";
import { weekProgress } from "@momentum/core/habits";
import { expandAll } from "@momentum/core/recurrence";
import {
  durationMinutes,
  localDateOf,
  nowInstant,
  startOfDay,
  todayIn,
  weekOf,
} from "@momentum/core/time";
import type {
  CalendarBlock,
  Habit,
  HabitCompletion,
  IanaTimeZone,
  LocalDate,
  Minutes,
  Profile,
  Project,
  Task,
  Uuid,
  WeeklyGoal,
  WorkBlock,
} from "@momentum/core/types";

import { itemFromBlock, itemFromOccurrence, type ItemContext } from "@/features/calendar/items";
import { rangeEndExclusive } from "@/features/calendar/projection";
import type {
  CalendarItem,
  CalendarWeekData,
  PlanningData,
  PlanningGoal,
  PlanningHabit,
  PlanTask,
} from "@/features/calendar/types";
import { requireSession } from "@/lib/auth/session";

/**
 * The calendar's one read.
 *
 * A page hands it the days it wants to render; it returns everything the client
 * island needs, already resolved: blocks and expanded occurrences as
 * `CalendarItem`s, the planning drawer's sections with the settings its maths
 * runs on, and "today" in the profile timezone. The client never fetches,
 * never expands a series, and never sees a database row
 * (docs/ARCHITECTURE.md §5, §6).
 *
 * Every boundary here resolves in `profile.timezone`, never the server's
 * (Domain Rule 4). Nothing in this file reads a clock except `today`, and that
 * one reads it once per request — it decides which tasks are overdue as well
 * as which column is today's, so the two can never disagree.
 */

/** Belongs to no project and has no estimate: an unscheduled task still has to render. */
const NO_MINUTES: Minutes = 0;

export interface CalendarWeekParams {
  /** Seven dates in week view, one in day view. Resolved from the URL by `navigation.ts`. */
  days: readonly LocalDate[];
}

export async function getCalendarWeek(params: CalendarWeekParams): Promise<CalendarWeekData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  const days = params.days;
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error("A displayed range always has at least one day.");
  }

  const today = todayIn(timezone, nowInstant());

  /*
   * The half-open UTC window `[start, end)` the range covers.
   *
   * Derived from the displayed days rather than from `weekRange`, because day
   * view shows one day and week view shows seven; for a full week the two are
   * the same instants by construction, since `weekRange` is itself
   * `startOfDay(start)` to `startOfDay(start + 7)`. Half-open throughout, so a
   * block ending exactly at midnight belongs to the earlier day and paging the
   * calendar never shows it twice. DST is not adjusted for here and must not be:
   * the local days either side of a transition are 23 or 25 hours long and
   * `startOfDay` already knows it.
   */
  const start = startOfDay(first, timezone);
  const end = startOfDay(rangeEndExclusive(days), timezone);

  /*
   * Weekly goals belong to a week, not to a displayed range: day view shows one
   * day and still lists the week's goals, so the week is the one containing the
   * range's first day in the profile's own week shape (Domain Rule 4).
   */
  const weekStart = weekOf(first, profile.weekStart).start;

  const rows = await blocks.listWindow(supabase, {
    start,
    end,
    startDate: first,
    endDate: last,
  });

  // Occurrences are expanded here and never materialised (Domain Rule 16).
  // `expandAll` filters overrides by series itself, so the window's whole
  // override list goes in unpartitioned.
  const occurrences = expandAll(rows.series, { start, end }, rows.overrides);

  const workBlocks = rows.blocks.filter(isWorkBlock);
  const scheduledTaskIds = unique(workBlocks.map((block) => block.taskId));
  const habitIds = unique(rows.blocks.flatMap((block) => (block.habitId ? [block.habitId] : [])));

  const [
    taskRows,
    projectRows,
    counts,
    habitRows,
    unscheduledRows,
    dueRows,
    overdueRows,
    goalRows,
    habitList,
    habitCompletions,
  ] = await Promise.all([
    tasks.listByIds(supabase, scheduledTaskIds),
    projects.listFor(supabase, userId),
    blocks.blockCountsByTask(supabase, scheduledTaskIds),
    blocks.habitLabels(supabase, habitIds),
    tasks.listUnscheduledFor(supabase, userId),
    tasks.listDueBetween(supabase, userId, first, last),
    tasks.listOverdue(supabase, userId, today),
    weeklyGoals.listForWeek(supabase, userId, weekStart),
    // The drawer's HABITS section (specs/05-week-planning.md, unblocked by
    // Phase 6). Archived habits are dropped here rather than in the query,
    // because the same read serves nothing else.
    habitsRepo.listFor(supabase, userId),
    habitsRepo.listCompletionsBetween(supabase, userId, first, last),
  ]);

  const tasksById = byId(taskRows);
  const projectsById = byId(projectRows);
  const sections = sectionTasks(overdueRows, dueRows, unscheduledRows);

  // Coverage for the OVERDUE and DUE THIS WEEK rows only: an UNSCHEDULED task
  // owns no work block, so its reserved minutes are zero by definition and
  // asking the database would be a round trip to be told so.
  const scheduledMinutes = await tasks.scheduledMinutesByTask(supabase, [
    ...sections.overdue.map((task) => task.id),
    ...sections.dueInRange.map((task) => task.id),
  ]);

  const itemContext: ItemContext = {
    tasksById,
    projectsById,
    blockCounts: counts,
    habitLabels: habitRows,
    timezone,
    today,
  };

  const items: CalendarItem[] = [
    ...rows.blocks.map((block) => itemFromBlock(block, itemContext)),
    ...occurrences.map(itemFromOccurrence),
  ];

  return {
    rangeStart: first,
    days,
    today,
    items,
    plan: buildPlan(
      sections,
      goalRows,
      projectsById,
      scheduledMinutes,
      workBlocks,
      profile,
      planningHabits(habitList, habitCompletions, rows.blocks, days, timezone),
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* The planning drawer                                                        */
/* -------------------------------------------------------------------------- */

/** The three task sections, already made disjoint. */
interface SectionTasks {
  overdue: readonly Task[];
  dueInRange: readonly Task[];
  unscheduled: readonly Task[];
}

/**
 * One task, one section (specs/05-week-planning.md).
 *
 * OVERDUE, DUE THIS WEEK and UNSCHEDULED are three questions, not three
 * partitions: a task due last Monday with no blocks answers all of them, and
 * a task due Thursday with no blocks answers two. The drawer shows each task
 * once, under the first section that claims it in the order above, so the
 * subtraction happens here rather than in every consumer. A duplicate row
 * would also register the same draggable id twice inside one `DndContext`,
 * which dnd-kit does not allow — so the overlap is not merely untidy, it
 * breaks dragging.
 *
 * Subtasks are dropped from every section. The drawer lists work a person
 * schedules, and a subtask is scheduled through its parent in this product
 * (`@momentum/core/tasks` `matchesView` applies the same rule to the task
 * manager's views). `listOverdue` already excludes them at the database; the
 * two older reads predate the rule and are filtered here so that all three
 * sections answer the same way.
 */
function sectionTasks(
  overdue: readonly Task[],
  dueInRange: readonly Task[],
  unscheduled: readonly Task[],
): SectionTasks {
  const overdueTasks = overdue.filter(isTopLevel);
  const claimed = new Set(overdueTasks.map((task) => task.id));

  const dueTasks = dueInRange.filter((task) => isTopLevel(task) && !claimed.has(task.id));
  for (const task of dueTasks) claimed.add(task.id);

  const unscheduledTasks = unscheduled.filter((task) => isTopLevel(task) && !claimed.has(task.id));

  return { overdue: overdueTasks, dueInRange: dueTasks, unscheduled: unscheduledTasks };
}

/**
 * The drawer's sections and the settings its maths runs on.
 *
 * Nothing here is a total. Planned, available and unscheduled minutes, the
 * per-day bars and the warnings are all computed on the client by
 * `@momentum/core/scheduling` over the items as the user currently sees them —
 * the optimistic week — so that a drop moves every number in the same frame
 * and rolls every number back with it (docs/ARCHITECTURE.md §8). A total
 * computed here would be right until the first drag and stale after it.
 *
 * What the server does contribute is the part the client cannot see:
 * `scheduledOutsideMinutes`, the coverage a task has on other weeks. The
 * client sums the range's own work blocks live and adds this number; the
 * subtraction below is what stops a block from being counted twice.
 */
function buildPlan(
  sections: SectionTasks,
  goals: readonly WeeklyGoal[],
  projectsById: ReadonlyMap<Uuid, Project>,
  scheduledMinutes: ReadonlyMap<Uuid, Minutes>,
  workBlocks: readonly WorkBlock[],
  settings: Pick<Profile, "workingHours" | "focusWindows">,
  habitRows: readonly PlanningHabit[],
): PlanningData {
  const inRange = minutesInRangeByTask(workBlocks);

  const outside = (task: Task): Minutes =>
    // A block inside the window is by definition part of the task's total, so
    // this cannot go below zero — unless the two reads raced a write between
    // them, in which case the honest answer is "nothing else that we know of"
    // rather than a negative coverage.
    Math.max(
      NO_MINUTES,
      (scheduledMinutes.get(task.id) ?? NO_MINUTES) - (inRange.get(task.id) ?? NO_MINUTES),
    );

  return {
    overdue: sections.overdue.map((task) => planTask(task, projectsById, outside(task))),
    dueInRange: sections.dueInRange.map((task) => planTask(task, projectsById, outside(task))),
    // An unscheduled task owns no block anywhere, so its outside coverage is
    // zero without asking.
    unscheduled: sections.unscheduled.map((task) => planTask(task, projectsById, NO_MINUTES)),
    habits: habitRows,
    weeklyGoals: goals.map(planningGoal),
    workingHours: settings.workingHours,
    focusWindows: settings.focusWindows,
  };
}

/**
 * The drawer's HABITS rows: the active habits, their progress over the
 * displayed range, and the days that already have time reserved.
 *
 * Progress is `weekProgress` from `@momentum/core/habits` — the same function
 * the habits page uses, over the same completions — so the two surfaces cannot
 * report a different number for the same week. In day view the range is one
 * day, and the progress it reports is honestly that one day's.
 *
 * Archived habits are excluded: they are not competing for the week, which is
 * the only thing this drawer lists.
 */
function planningHabits(
  habitRows: readonly Habit[],
  completions: readonly HabitCompletion[],
  blockRows: readonly CalendarBlock[],
  days: readonly LocalDate[],
  timezone: IanaTimeZone,
): PlanningHabit[] {
  const reserved = new Map<Uuid, LocalDate[]>();
  for (const block of blockRows) {
    if (block.kind !== "habit") continue;
    const date = localDateOf(block.startAt, timezone);
    const dates = reserved.get(block.habitId);
    if (dates) {
      if (!dates.includes(date)) dates.push(date);
    } else {
      reserved.set(block.habitId, [date]);
    }
  }

  return habitRows
    .filter((habit) => habit.archivedAt === null)
    .map((habit) => ({
      habit,
      progress: weekProgress(
        habit,
        days,
        completions.filter((completion) => completion.habitId === habit.id),
      ),
      reservedDates: reserved.get(habit.id) ?? [],
    }));
}

/**
 * Elapsed minutes of the window's work blocks, per task — the same rows the
 * client receives as items, summed the same way the client sums them. Whole
 * blocks, not the part inside the window: a block that runs past midnight on
 * the range's last day is one item on the client, and it is subtracted here
 * as one block.
 */
function minutesInRangeByTask(workBlocks: readonly WorkBlock[]): Map<Uuid, Minutes> {
  const minutes = new Map<Uuid, Minutes>();
  for (const block of workBlocks) {
    const span = durationMinutes(block.startAt, block.endAt);
    minutes.set(block.taskId, (minutes.get(block.taskId) ?? NO_MINUTES) + span);
  }
  return minutes;
}

function planTask(
  task: Task,
  projectsById: ReadonlyMap<Uuid, Project>,
  scheduledOutsideMinutes: Minutes,
): PlanTask {
  const project = task.projectId ? (projectsById.get(task.projectId) ?? null) : null;

  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    estimatedMinutes: task.estimatedMinutes,
    dueDate: task.dueDate,
    projectName: project?.name ?? null,
    projectColor: project?.color ?? null,
    scheduledOutsideMinutes,
  };
}

/** Read-only until Phase 8 owns progress and claiming; the drawer lists the promise, not the score. */
function planningGoal(goal: WeeklyGoal): PlanningGoal {
  return {
    id: goal.id,
    title: goal.title,
    metric: goal.metric,
    target: goal.target,
    completedAt: goal.completedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Narrows to the kind whose `taskId` the compiler then knows is non-null. */
function isWorkBlock(block: CalendarBlock): block is WorkBlock {
  return block.kind === "work";
}

function isTopLevel(task: Task): boolean {
  return task.parentTaskId === null;
}

function unique(ids: readonly Uuid[]): Uuid[] {
  return [...new Set(ids)];
}

function byId<T extends { id: Uuid }>(rows: readonly T[]): Map<Uuid, T> {
  return new Map(rows.map((row) => [row.id, row]));
}
