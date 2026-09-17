import "server-only";

import {
  blocks,
  focus,
  gamification,
  habits as habitsRepo,
  projects as projectsRepo,
  tasks,
} from "@momentum/db";
import { levelProgress, questFactsFor, questProgress } from "@momentum/core/gamification";
import { expandAll } from "@momentum/core/recurrence";
import { detectConflicts } from "@momentum/core/scheduling";
import {
  addDays,
  durationMinutes,
  minutesFromMidnight,
  nowInstant,
  startOfDay,
  todayIn,
  weekOf,
} from "@momentum/core/time";
import type {
  CalendarBlock,
  FocusSession,
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
  Project,
  QuestAssignment,
  QuestDefinition,
  Task,
  TimeWindow,
  Uuid,
  WorkBlock,
  WorkingHours,
} from "@momentum/core/types";

import { itemFromBlock, itemFromOccurrence, type ItemContext } from "@/features/calendar/items";
import type { CalendarItem } from "@/features/calendar/types";
import type { QuestRow } from "@/features/gamification/types";
import { commitmentsOf } from "@/features/planning/live";
import { buildTimeline, dayPartOf, habitsForToday } from "@/features/today/agenda";
import type {
  InsufficientTimeWarning,
  OverlapWarning,
  TodayItem,
  TodayPageData,
  TodayProject,
  TodayTask,
} from "@/features/today/types";
import { requireSession } from "@/lib/auth/session";

/**
 * The Today page's one read, resolved in the profile timezone from one clock
 * reading. Blocks are read over today and tomorrow: the timeline keeps today's
 * slice, and the extra day lets the conflict engine judge a deadline tomorrow,
 * which it refuses to do outside the range it was given.
 */

/** How far ahead Next Up looks for a candidate when nothing is scheduled. */
export const CANDIDATE_HORIZON_DAYS = 14;

const NO_MINUTES: Minutes = 0;

export async function getTodayPage(): Promise<TodayPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  const serverNow = nowInstant();
  const today = todayIn(timezone, serverNow);
  const tomorrow = addDays(today, 1);
  const week = weekOf(today, profile.weekStart);

  // `todayWindow` is what "today" means to every count; `rangeWindow` is the two
  // days the conflict engine sees. `startOfDay` handles 23/25-hour DST days.
  const todayWindow = { start: startOfDay(today, timezone), end: startOfDay(tomorrow, timezone) };
  const rangeWindow = {
    start: todayWindow.start,
    end: startOfDay(addDays(today, 2), timezone),
  };

  const [
    rows,
    overdueRows,
    dueRows,
    projectRows,
    habitRows,
    habitCompletions,
    assignments,
    questDefinitions,
    completedTasks,
    focusSessions,
    completedBlocks,
    awardedToday,
    openTaskCount,
    hasScheduledWork,
  ] = await Promise.all([
    blocks.listWindow(supabase, {
      start: rangeWindow.start,
      end: rangeWindow.end,
      startDate: today,
      endDate: tomorrow,
    }),
    tasks.listOverdue(supabase, userId, today),
    tasks.listDueBetween(supabase, userId, today, addDays(today, CANDIDATE_HORIZON_DAYS)),
    projectsRepo.listFor(supabase, userId),
    habitsRepo.listFor(supabase, userId),
    habitsRepo.listCompletionsBetween(supabase, userId, week.start, addDays(week.start, 6)),
    // Idempotent, so Today can show a quest before /progress has ever been visited.
    gamification.ensureQuests(supabase),
    gamification.listQuestDefinitions(supabase),
    tasks.listCompletedBetween(supabase, userId, todayWindow),
    focus.listStartedBetween(supabase, userId, todayWindow),
    blocks.listCompletedBetween(supabase, userId, todayWindow),
    gamification.xpAwardedBetween(supabase, userId, todayWindow),
    // For the empty states: what the whole account holds, not just today.
    tasks.countTopLevelFor(supabase, userId, "open"),
    blocks.hasWorkBlock(supabase, userId),
  ]);

  const occurrences = expandAll(rows.series, rangeWindow, rows.overrides);

  const workBlocks = rows.blocks.filter(isWorkBlock);
  const scheduledTaskIds = unique(workBlocks.map((block) => block.taskId));
  const habitIds = unique(rows.blocks.flatMap((block) => (block.habitId ? [block.habitId] : [])));

  const dueTasks = dueRows.filter(isTopLevel);
  const overdueTasks = overdueRows.filter(isTopLevel);

  const [taskRows, counts, habitLabels, scheduledMinutes] = await Promise.all([
    tasks.listByIds(supabase, scheduledTaskIds),
    blocks.blockCountsByTask(supabase, scheduledTaskIds),
    blocks.habitLabels(supabase, habitIds),
    // "Has time reserved" is about the task, not the day: summed over all its blocks.
    tasks.scheduledMinutesByTask(supabase, [
      ...overdueTasks.map((task) => task.id),
      ...dueTasks.map((task) => task.id),
    ]),
  ]);

  const projectsById = byId(projectRows);
  const itemContext: ItemContext = {
    tasksById: byId(taskRows),
    projectsById,
    blockCounts: counts,
    habitLabels,
    timezone,
    today,
  };

  const items: CalendarItem[] = [
    ...rows.blocks.map((block) => itemFromBlock(block, itemContext)),
    ...occurrences.map(itemFromOccurrence),
  ];

  const timeline = buildTimeline(
    items.map((item) => ({ item, project: projectOfItem(item, itemContext, projectsById) })),
    today,
    timezone,
  );

  const todayTask = (task: Task): TodayTask => ({
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    estimatedMinutes: task.estimatedMinutes,
    scheduledMinutes: scheduledMinutes.get(task.id) ?? NO_MINUTES,
    project: projectOf(task.projectId, projectsById),
    // Open by construction; a completion only arrives through the optimistic overlay.
    completedAt: null,
  });

  const overdue = overdueTasks.map(todayTask);
  const dueToday = dueTasks.filter((task) => task.dueDate === today).map(todayTask);

  const questFacts = questFactsFor(
    {
      completedTasks,
      focusSessions: endedSessions(focusSessions),
      habitCompletions,
      completedBlocks,
    },
    timezone,
    [today],
  );

  return {
    serverNow,
    timezone,
    today,
    week: week.days,
    dayPart: dayPartOf(minutesFromMidnight(serverNow, timezone)),
    displayName: profile.displayName,
    level: levelProgress(profile.xp),
    xpToday: awardedToday.reduce((total, row) => total + row.amount, 0),
    timeline,
    // Due today with no time reserved anywhere; a scheduled task is on the timeline instead.
    tasks: dueToday.filter((task) => task.scheduledMinutes === NO_MINUTES),
    overdue,
    // Overdue first, then by deadline (`listDueBetween`'s order). A task scheduled
    // for another day belongs here too: it is still what is due soonest.
    candidates: [...overdue, ...dueTasks.map(todayTask)],
    habits: habitsForToday(habitRows, habitCompletions, week.days, today),
    quests: questRows(assignments, questDefinitions, questFacts),
    completedTasksToday: completedTasks.length,
    warnings: todayWarnings({
      items,
      timeline,
      tasks: [...overdueTasks, ...dueTasks],
      scheduledMinutes,
      workBlocks,
      profile,
      days: [today, tomorrow],
      today,
      now: serverNow,
      timezone,
    }),
    openTaskCount,
    hasScheduledWork,
  };
}

/** Daily quests only, with progress from the same rows SQL checks a claim against. */
function questRows(
  assignments: readonly QuestAssignment[],
  definitions: readonly QuestDefinition[],
  facts: ReturnType<typeof questFactsFor>,
): QuestRow[] {
  const definitionById = new Map<Uuid, QuestDefinition>(
    definitions.map((definition) => [definition.id, definition]),
  );

  return assignments
    .filter((assignment) => assignment.period === "daily")
    .flatMap((assignment) => {
      const definition = definitionById.get(assignment.questId);
      if (definition === undefined) return [];

      const progress = questProgress(facts, definition.metric, definition.target);
      return [
        {
          assignmentId: assignment.id,
          definition,
          progress,
          completedAt: assignment.completedAt,
          claimable: assignment.completedAt === null && progress.met,
        },
      ];
    });
}

interface WarningInput {
  items: readonly CalendarItem[];
  timeline: readonly TodayItem[];
  tasks: readonly Task[];
  scheduledMinutes: ReadonlyMap<Uuid, Minutes>;
  workBlocks: readonly WorkBlock[];
  profile: { workingHours: WorkingHours; focusWindows: readonly TimeWindow[] };
  days: readonly LocalDate[];
  today: LocalDate;
  now: Instant;
  timezone: IanaTimeZone;
}

/**
 * Only insufficient-time and today's overlaps: over-capacity and past-deadline
 * belong to the calendar drawer, and tomorrow is in the range so a deadline
 * there can be judged, not so its overlaps are reported.
 */
function todayWarnings(input: WarningInput): (InsufficientTimeWarning | OverlapWarning)[] {
  const inRange = minutesInRangeByTask(input.workBlocks);

  const warnings = detectConflicts({
    context: {
      timezone: input.timezone,
      workingHours: input.profile.workingHours,
      focusWindows: input.profile.focusWindows,
      days: input.days,
      today: input.today,
    },
    commitments: commitmentsOf(input.items),
    tasks: input.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      estimatedMinutes: task.estimatedMinutes,
      dueDate: task.dueDate,
      // The range's own blocks are already commitments; subtracting them stops double counting.
      scheduledOutsideMinutes: Math.max(
        NO_MINUTES,
        (input.scheduledMinutes.get(task.id) ?? NO_MINUTES) - (inRange.get(task.id) ?? NO_MINUTES),
      ),
    })),
    now: input.now,
  });

  const shown: (InsufficientTimeWarning | OverlapWarning)[] = [];
  for (const warning of warnings) {
    if (warning.kind === "insufficient-time") shown.push(warning);
    else if (warning.kind === "overlap" && warning.date === input.today) shown.push(warning);
  }
  return shown;
}

/** A work block's project; events and habit blocks have none. */
function projectOfItem(
  item: CalendarItem,
  context: ItemContext,
  projectsById: ReadonlyMap<Uuid, Project>,
): TodayProject | null {
  if (item.work === null) return null;
  const task = context.tasksById.get(item.work.taskId);
  return projectOf(task?.projectId ?? null, projectsById);
}

function projectOf(
  projectId: Uuid | null,
  projectsById: ReadonlyMap<Uuid, Project>,
): TodayProject | null {
  if (projectId === null) return null;
  const project = projectsById.get(projectId);
  return project === undefined ? null : { name: project.name, color: project.color };
}

/** Ended sessions only; a live one has no measured minutes yet. */
function endedSessions(sessions: readonly FocusSession[]): FocusSession[] {
  return sessions.filter(
    (session) => session.status === "completed" || session.status === "abandoned",
  );
}

/** Elapsed minutes of the range's work blocks, per task. */
function minutesInRangeByTask(workBlocks: readonly WorkBlock[]): Map<Uuid, Minutes> {
  const minutes = new Map<Uuid, Minutes>();
  for (const block of workBlocks) {
    const span = durationMinutes(block.startAt, block.endAt);
    minutes.set(block.taskId, (minutes.get(block.taskId) ?? NO_MINUTES) + span);
  }
  return minutes;
}

function isWorkBlock(block: CalendarBlock): block is WorkBlock {
  return block.kind === "work";
}

/** A subtask is scheduled and completed through its parent in this product. */
function isTopLevel(task: Task): boolean {
  return task.parentTaskId === null;
}

function unique(ids: readonly Uuid[]): Uuid[] {
  return [...new Set(ids)];
}

function byId<T extends { id: Uuid }>(rows: readonly T[]): Map<Uuid, T> {
  return new Map(rows.map((row) => [row.id, row]));
}
