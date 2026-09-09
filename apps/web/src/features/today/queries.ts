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
 * The Today page's one read.
 *
 * Everything the page shows is resolved here, in the profile timezone, from a
 * single request's clock reading (Domain Rule 4). The client island fetches
 * nothing, expands no series, does no date arithmetic and never sees a database
 * row (docs/ARCHITECTURE.md §5, §6); the only thing it recomputes as time
 * passes is which item is past, current and next, which is the one answer that
 * changes without a write.
 *
 * The blocks are read over **today and tomorrow**, not today alone. The
 * timeline uses today's slice and drops the rest (`buildTimeline`); the extra
 * day exists so the conflict engine can judge a deadline the day after this one
 * — `@momentum/core/scheduling` deliberately refuses to judge a deadline
 * outside the range it was given, because it cannot see the free time in
 * between. Reading one more day is what makes "due soon" mean more than "due
 * before midnight".
 */

/**
 * How far ahead Next Up looks for something to offer when the day holds nothing
 * scheduled.
 *
 * Two weeks. Far enough that the answer is never "nothing" for a user with any
 * dated work at all; short enough that the fallback is still something worth
 * starting now rather than a deadline in another month.
 */
export const CANDIDATE_HORIZON_DAYS = 14;

/** Zero, named, for the coverage arithmetic below. */
const NO_MINUTES: Minutes = 0;

export async function getTodayPage(): Promise<TodayPageData> {
  const { supabase, userId, profile } = await requireSession();
  const timezone = profile.timezone;

  const serverNow = nowInstant();
  const today = todayIn(timezone, serverNow);
  const tomorrow = addDays(today, 1);
  const week = weekOf(today, profile.weekStart);

  /*
   * Two half-open windows. `todayWindow` is what "today" means to every count
   * on this page; `rangeWindow` is the two days the conflict engine sees.
   * `startOfDay` knows that the local days either side of a DST transition are
   * 23 or 25 hours long, so neither is a hardcoded span (Domain Rule 4).
   */
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
    // Assigning is idempotent and resolves the period from the profile itself,
    // so the page can simply ask for "the current quests" (Domain Rule 17).
    // Today is the surface a user opens first, so it is the surface that has to
    // be able to show a quest before /progress has ever been visited.
    gamification.ensureQuests(supabase),
    gamification.listQuestDefinitions(supabase),
    tasks.listCompletedBetween(supabase, userId, todayWindow),
    focus.listStartedBetween(supabase, userId, todayWindow),
    blocks.listCompletedBetween(supabase, userId, todayWindow),
    gamification.xpAwardedBetween(supabase, userId, todayWindow),
  ]);

  // Occurrences are expanded here and never materialised (Domain Rule 16).
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
    // Coverage for the rows Today can show or judge. "Has time reserved" is a
    // question about the task and not about the day, so it is summed over all
    // of a task's blocks (Domain Rule 2).
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
    // The three lists are open tasks by construction; a completion only ever
    // arrives here through the optimistic overlay.
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
    // Due today and with no time reserved anywhere. A task that is scheduled
    // is on the timeline instead, and listing it twice would be the page
    // asking the same question in two places.
    tasks: dueToday.filter((task) => task.scheduledMinutes === NO_MINUTES),
    overdue,
    /*
     * What Next Up offers when the day holds nothing scheduled, in the order it
     * offers them: overdue first, then everything with a deadline in the next
     * two weeks. `listDueBetween` already returns them by deadline and then by
     * priority, so the first open row is the answer and the ordering is the
     * database's rather than a second opinion about it. A task that is
     * scheduled for another day belongs here too — it is still what is due
     * soonest, and today simply holds no time for it.
     */
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
  };
}

/* -------------------------------------------------------------------------- */
/* Quests                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Today's quests, with progress computed from the same rows a claim is checked
 * against in SQL — so the Claim control is never offered for something the
 * database would then refuse (Domain Rule 6).
 *
 * Weekly quests are absent: they are not today's, and /progress is where a week
 * is looked at.
 */
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

/* -------------------------------------------------------------------------- */
/* At risk                                                                    */
/* -------------------------------------------------------------------------- */

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
 * The two engine warnings At Risk shows, and only those.
 *
 * `detectConflicts` produces four kinds. Over-capacity and past-deadline are
 * planning questions — "this week is shaped wrong" — and belong to the calendar
 * drawer that can do something about them; specs/09-today.md names exactly
 * three things this section shows, and the third one (an overdue task) is
 * derived on the client so that completing it clears the row in the same frame.
 *
 * Overlaps are narrowed to today. Tomorrow's double booking is real and is
 * still tomorrow's; the day after this one is in the range so that a *deadline*
 * there can be judged, not so that the page starts reporting it.
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
      // The range's own blocks are among the commitments, so only the coverage
      // the range cannot see is added — subtracting first is what stops a block
      // from being counted twice.
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

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A work block's project, for the line under its title.
 *
 * Only work blocks have one: an event belongs to no project and a habit block
 * belongs to its habit. The colour on the item is already resolved (it may be
 * the block's own override); this is the project's name and hue as such.
 */
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

/**
 * Ended sessions only. A live one has no measured minutes yet and contributes
 * nothing, so it is filtered rather than counted as zero.
 */
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

/** Narrows to the kind whose `taskId` the compiler then knows is non-null. */
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
