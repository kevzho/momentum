import type { GridSpec } from "@momentum/core/calendar";
import type { HabitProgress } from "@momentum/core/habits";
import type {
  BlockKind,
  Habit,
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
  ProjectColor,
  QuestMetric,
  SnapMinutes,
  TaskPriority,
  TimeWindow,
  Uuid,
  Weekday,
  WorkingHours,
} from "@momentum/core/types";

/**
 * The calendar feature's view models and the props contracts between its parts.
 *
 * The week grid, the interaction layer, the Plan panel and the block editor are
 * built as separate units against the declarations in this file. It exists so
 * that "what does the grid hand a block?" has exactly one answer that the
 * compiler checks, rather than four components agreeing by convention.
 *
 * Nothing here is a database row. `queries.ts` reads rows, expands recurring
 * series, resolves the task context a work block needs, and hands the client
 * island the shapes below — which are serialisable, timezone-resolved only in
 * the sense that every instant is UTC, and carry no methods.
 */

/* -------------------------------------------------------------------------- */
/* View models                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The context a work block needs beyond its own row: what its task is called,
 * whether the task is already done, and — the part that cannot be derived from
 * one row — whether this is the last block of the task still outstanding.
 *
 * Domain Rule 13 labels the block's completion control by what it will do:
 * the last incomplete block of a task reads "Complete task" and completes both;
 * any other block reads "Done with this block". That decision needs to see the
 * task's other blocks, so the server makes it and sends the answer.
 */
export interface WorkBlockContext {
  taskId: Uuid;
  taskTitle: string;
  taskCompletedAt: Instant | null;
  /** The task's deadline, so the planner can see a block scheduled after it (Phase 5). */
  taskDueDate: LocalDate | null;
  /** The task's estimate, for live coverage while a schedule is in flight (Phase 5). */
  taskEstimatedMinutes: Minutes | null;
  /** Total work blocks the task owns, across all weeks. */
  blockCount: number;
  /** True when completing this block should also complete the task. */
  completesTask: boolean;
}

/** Where an item came from, when it was expanded rather than read. */
export interface OccurrenceRef {
  seriesId: Uuid;
  occurrenceDate: LocalDate;
}

/**
 * One thing on the board, resolved for rendering.
 *
 * `id` is the React key and the identity the optimistic layer works in: a
 * stored block's UUID, or `${seriesId}:${occurrenceDate}` for an occurrence
 * that has no row of its own yet (docs/ARCHITECTURE.md §11). `blockId` is the
 * row a mutation targets, and is null for exactly those virtual occurrences —
 * editing one writes an override, which is a different action from editing a
 * block, so the difference is worth carrying in the type.
 */
export interface CalendarItem {
  id: string;
  blockId: Uuid | null;
  kind: BlockKind;
  title: string;
  description: string | null;
  startAt: Instant;
  endAt: Instant;
  allDay: boolean;
  /**
   * The colour stored on the row, or null when the block inherits.
   *
   * Kept beside the resolved `color` because the editor has to round-trip
   * inheritance: preselecting the resolved colour and saving it would write an
   * explicit value onto a block that was following its project, and the block
   * would silently stop tracking it.
   */
  ownColor: ProjectColor | null;
  /** Resolved for display: `ownColor`, else the project's, else the kind default. */
  color: ProjectColor;
  completedAt: Instant | null;
  occurrence: OccurrenceRef | null;
  /** Present exactly when `kind === "work"`. */
  work: WorkBlockContext | null;
  /** Present exactly when `kind === "habit"`. */
  habitId: Uuid | null;
  /**
   * For a habit block: whether its own date is inside the window
   * `record_habit_completion` accepts — yesterday, today or tomorrow in the
   * profile timezone (Phase 6).
   *
   * The server decides it, for the same reason it decides `completesTask`: the
   * control has to promise only what the database will do. A habit block older
   * than yesterday still renders and can still be un-completed; it simply
   * offers no way to record a completion, rather than offering one that must
   * fail (Domain Rule 13's labelling principle).
   *
   * Always false for work blocks and events.
   */
  habitRecordable: boolean;
}

/**
 * A task in the planning drawer: a drag source, a keyboard scheduling target,
 * and what Find Time places.
 *
 * `scheduledOutsideMinutes` is the coverage the displayed range cannot see.
 * The range's own work blocks are `CalendarItem`s on the client, so the drawer
 * sums those live and adds this number — which is what lets the coverage on a
 * row move in the same frame as the drop that changed it, and never counts an
 * optimistic block twice.
 */
export interface PlanTask {
  id: Uuid;
  title: string;
  priority: TaskPriority;
  estimatedMinutes: Minutes | null;
  dueDate: LocalDate | null;
  projectName: string | null;
  projectColor: ProjectColor | null;
  /** Elapsed minutes of this task's work blocks that fall outside the displayed range. */
  scheduledOutsideMinutes: Minutes;
}

/**
 * A habit in the planning drawer.
 *
 * It carries the habit itself rather than pre-rendered strings, so the drawer's
 * row formats it with the habits feature's own `copy.ts` and the two surfaces
 * cannot describe the same target differently.
 *
 * Habits are not drag sources. A task is dropped onto a slot the user chooses;
 * a habit's schedule already says which days it wants, so its route into the
 * week is "Add to week" — the same action the habits page offers, generating
 * the same blocks (specs/06-habits.md, docs/ARCHITECTURE.md §11). The keyboard
 * route and the pointer route are therefore the same button, which is Domain
 * Rule 10 satisfied by construction.
 */
export interface PlanningHabit {
  habit: Habit;
  /** Progress toward the habit's target over the displayed week. */
  progress: HabitProgress;
  /** Dates in the displayed range that already carry a block for it. */
  reservedDates: readonly LocalDate[];
}

/** A weekly goal, read-only until Phase 8 owns its progress and claiming. */
export interface PlanningGoal {
  id: Uuid;
  title: string | null;
  metric: QuestMetric;
  target: number;
  completedAt: Instant | null;
}

/**
 * The planning drawer's sections and the settings its maths runs on
 * (specs/05-week-planning.md).
 *
 * A task appears in exactly one section, decided on the server in this order:
 * OVERDUE (open, due before today), then DUE THIS WEEK (open, due inside the
 * displayed range), then UNSCHEDULED (open, owning no work block anywhere).
 * One row per task is what the user expects of a 320px column, and it is also
 * what dnd-kit requires — `taskDraggableId` is keyed by the task alone, so a
 * task in two sections would register the same draggable id twice.
 *
 * HABITS sits between UNSCHEDULED and WEEKLY GOALS (Phase 6). Its rows are not
 * draggable, for the reason given on `PlanningHabit`.
 *
 * `workingHours` and `focusWindows` come from the profile with the rest of the
 * read, so the client can run capacity, conflict and Find Time maths over the
 * optimistic week without a second request.
 */
export interface PlanningData {
  overdue: readonly PlanTask[];
  dueInRange: readonly PlanTask[];
  unscheduled: readonly PlanTask[];
  habits: readonly PlanningHabit[];
  weeklyGoals: readonly PlanningGoal[];
  workingHours: WorkingHours;
  focusWindows: readonly TimeWindow[];
}

/** Everything the server hands the client island for one displayed range. */
export interface CalendarWeekData {
  /** First day of the displayed range, already resolved against the week-start preference. */
  rangeStart: LocalDate;
  /** Seven dates in week view, one in day view. */
  days: readonly LocalDate[];
  /** "Today" in the profile timezone, computed once per request on the server (§10). */
  today: LocalDate;
  items: readonly CalendarItem[];
  plan: PlanningData;
}

/* -------------------------------------------------------------------------- */
/* Geometry projection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One item's slice of one day column, in wall-clock minutes from that day's
 * midnight. A block from 23:30 Monday to 00:30 Tuesday is two segments, so
 * both columns show it and neither has to reason about the other
 * (Domain Rule 4).
 */
export interface ItemSegment {
  /** `${item.id}:${date}` — unique across the grid. */
  key: string;
  item: CalendarItem;
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
  /** False on the continuation segments of a block that started the day before. */
  isStart: boolean;
  /** False when the block continues into the next day. */
  isEnd: boolean;
  /** Side-by-side placement within its overlap cluster. */
  column: number;
  columns: number;
}

/** A day column's header, resolved for display. */
export interface CalendarDay {
  date: LocalDate;
  /** "MON" */
  weekdayLabel: string;
  /** "7" */
  dayOfMonthLabel: string;
  isToday: boolean;
}

/* -------------------------------------------------------------------------- */
/* Drafts — what a create or edit interaction is holding                      */
/* -------------------------------------------------------------------------- */

/** A wall-clock span on one day. The unit every interaction produces. */
export interface DaySpan {
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
}

/**
 * The block editor is one component in two modes. A create draft carries the
 * span the user selected and no id; an edit draft carries the item. Keeping
 * them one union means the form, its validation and its keyboard handling are
 * written once.
 */
export type BlockDraft =
  { mode: "create"; span: DaySpan } | { mode: "edit"; item: CalendarItem; span: DaySpan };

/* -------------------------------------------------------------------------- */
/* Props contracts between the feature's parts                                */
/* -------------------------------------------------------------------------- */

/** The settings the whole surface resolves dates and geometry against. */
export interface CalendarSettings {
  timezone: IanaTimeZone;
  weekStart: Weekday;
  snapMinutes: SnapMinutes;
  spec: GridSpec;
}

/**
 * What the grid can ask the board to do. The grid never mutates and never
 * knows about server actions; it reports intent and the board decides.
 */
export interface CalendarCallbacks {
  /** Empty space was clicked or a keyboard cursor committed: open a create draft. */
  onCreateAt: (span: DaySpan) => void;
  /** A block was activated (click, Enter): open its editor. */
  onOpenItem: (item: CalendarItem) => void;
  /** The completion control on a work block was used. */
  onToggleComplete: (item: CalendarItem) => void;
  /** Delete, from the block's keyboard shortcut or its editor. */
  onDelete: (item: CalendarItem) => void;
  /** A committed move or resize, in wall-clock minutes on a day. */
  /**
   * A block was moved or resized. A keyboard commit passes the sentence to say
   * once the write has landed; the pointer path passes none, because dnd-kit's
   * own live region already speaks the drop.
   */
  onReschedule: (item: CalendarItem, span: DaySpan, announcement?: string) => void;
  /** A task from the Plan panel was dropped or scheduled onto a span. */
  onScheduleTask: (taskId: Uuid, span: DaySpan) => void;
}

export interface WeekGridProps {
  days: readonly CalendarDay[];
  settings: CalendarSettings;
  /** Keyed by `LocalDate`; every displayed day has an entry, possibly empty. */
  segmentsByDate: ReadonlyMap<string, readonly ItemSegment[]>;
  /** All-day items by `LocalDate`, from `buildAllDay`. They are not in the time grid. */
  allDayByDate: ReadonlyMap<string, readonly CalendarItem[]>;
  /**
   * Where the grid opens, from `initialScrollMinutes`. The scroll container is
   * inside the grid, so nothing above it can set the offset.
   */
  scrollToMinutes: Minutes;
  /** The current instant, or null before hydration — drives the now-line only. */
  now: Instant | null;
  /** The span an in-flight drag, resize or keyboard move would commit to. */
  candidate: CandidateSpan | null;
  callbacks: CalendarCallbacks;
  /** Items with a mutation in flight; their blocks read as pending. */
  pendingItemIds: ReadonlySet<string>;
}

/**
 * The provisional span of an interaction in progress: rendered as a
 * placeholder in the grid so the user sees where the block will land, and
 * never written until the interaction commits (docs/ARCHITECTURE.md §9 step 4 —
 * because mutation happens only on commit, Escape is always a no-op on data).
 */
export interface CandidateSpan extends DaySpan {
  /** The item being moved or resized; null while creating or dragging a task in. */
  itemId: string | null;
  label: string;
}

export interface BlockEditorProps {
  draft: BlockDraft | null;
  settings: CalendarSettings;
  onClose: () => void;
  /** Create or edit committed. The board routes it to the right action. */
  onSubmit: (draft: BlockDraft, values: BlockEditorValues) => void;
  onDelete: (item: CalendarItem) => void;
  onToggleComplete: (item: CalendarItem) => void;
  pending: boolean;
}

/** The fields the editor collects. Times are wall-clock minutes on `date`. */
export interface BlockEditorValues {
  title: string;
  description: string | null;
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
  color: ProjectColor | null;
}

/* -------------------------------------------------------------------------- */
/* The grid ↔ interaction seam                                                */
/* -------------------------------------------------------------------------- */

/**
 * The week grid owns what the calendar *looks* like; the interaction layer owns
 * what it *does*. They meet at exactly two components, declared here so the
 * two can be built against one another without either importing the other's
 * internals.
 *
 * `DayColumn` is the droppable, the drag-to-create surface and the home of the
 * keyboard grid cursor. `BlockShell` is the draggable, the resize handles, the
 * focus target and the keyboard move/resize modes. Both take their geometry as
 * plain numbers from the grid, so neither does date maths.
 */

export interface DayColumnProps {
  date: LocalDate;
  settings: CalendarSettings;
  isToday: boolean;
  /** True in day view, where the single column is not a week's worth of one day. */
  className?: string;
  /** The hour lines and the blocks, positioned by the grid. */
  children: React.ReactNode;
  callbacks: CalendarCallbacks;
  /** Focus lands here from the grid's roving tabindex; -1 for the others. */
  tabIndex?: number;
}

export interface BlockShellProps {
  segment: ItemSegment;
  settings: CalendarSettings;
  callbacks: CalendarCallbacks;
  /** Absolute placement computed by the grid from the segment and the spec. */
  style: React.CSSProperties;
  /** The block's visual, rendered by the grid. */
  children: React.ReactNode;
  /** Screen-reader label for the whole block, built by the grid from resolved times. */
  label: string;
  /** True while a mutation for this item is in flight. */
  pending?: boolean;
}

export interface BlockViewProps {
  segment: ItemSegment;
  settings: CalendarSettings;
  callbacks: CalendarCallbacks;
  /** Suppresses the completion control and handles on the drag ghost. */
  ghost?: boolean;
}
