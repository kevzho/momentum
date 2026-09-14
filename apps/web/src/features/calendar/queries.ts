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
 * The calendar's one read: items, the planning drawer's sections, and "today",
 * all resolved in `profile.timezone`. The clock is read once per request so
 * overdue tasks and today's column cannot disagree.
 */

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

  // Half-open `[start, end)`, so a block ending at midnight belongs to the
  // earlier day. No DST adjustment: `startOfDay` already handles 23/25-hour days.
  const start = startOfDay(first, timezone);
  const end = startOfDay(rangeEndExclusive(days), timezone);

  // Weekly goals belong to the week containing the range's first day, even in day view.
  const weekStart = weekOf(first, profile.weekStart).start;

  const rows = await blocks.listWindow(supabase, {
    start,
    end,
    startDate: first,
    endDate: last,
  });

  // Occurrences are expanded, never materialised. `expandAll` filters overrides by series itself.
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
    habitsRepo.listFor(supabase, userId),
    habitsRepo.listCompletionsBetween(supabase, userId, first, last),
  ]);

  const tasksById = byId(taskRows);
  const projectsById = byId(projectRows);
  const sections = sectionTasks(overdueRows, dueRows, unscheduledRows);

  // An UNSCHEDULED task owns no work block, so only the other two sections are asked.
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
    // The rows behind the occurrences, so an occurrence can open its series.
    series: rows.series,
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

/** The three task sections, already made disjoint. */
interface SectionTasks {
  overdue: readonly Task[];
  dueInRange: readonly Task[];
  unscheduled: readonly Task[];
}

/**
 * One task, one section: the first of OVERDUE, DUE THIS WEEK, UNSCHEDULED that
 * claims it. A duplicate would register the same draggable id twice in one
 * `DndContext`, which breaks dragging. Subtasks are dropped from every
 * section, matching `matchesView` in `@momentum/core/tasks`.
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
 * Totals are computed on the client over the optimistic week; the server
 * contributes only `scheduledOutsideMinutes`, the coverage on other weeks. The
 * subtraction below stops a block in the range from being counted twice.
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
    // Only goes negative if the two reads raced a write; clamp rather than report it.
    Math.max(
      NO_MINUTES,
      (scheduledMinutes.get(task.id) ?? NO_MINUTES) - (inRange.get(task.id) ?? NO_MINUTES),
    );

  return {
    overdue: sections.overdue.map((task) => planTask(task, projectsById, outside(task))),
    dueInRange: sections.dueInRange.map((task) => planTask(task, projectsById, outside(task))),
    unscheduled: sections.unscheduled.map((task) => planTask(task, projectsById, NO_MINUTES)),
    habits: habitRows,
    weeklyGoals: goals.map(planningGoal),
    workingHours: settings.workingHours,
    focusWindows: settings.focusWindows,
  };
}

/**
 * The drawer's HABITS rows: active habits, progress over the displayed range
 * (via `weekProgress`, as the habits page), and the days already reserved.
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

// Whole blocks, not the part inside the window: the client sums them the same way.
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

function planningGoal(goal: WeeklyGoal): PlanningGoal {
  return {
    id: goal.id,
    title: goal.title,
    metric: goal.metric,
    target: goal.target,
    completedAt: goal.completedAt,
  };
}

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
