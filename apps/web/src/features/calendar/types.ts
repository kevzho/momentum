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
 * The calendar feature's view models and the props contracts between its
 * parts. Nothing here is a database row; everything is serialisable.
 */

/** What a work block needs beyond its own row. The server decides `completesTask`, which needs the task's other blocks. */
export interface WorkBlockContext {
  taskId: Uuid;
  taskTitle: string;
  taskCompletedAt: Instant | null;
  /** The task's deadline, so the planner can flag a block scheduled after it. */
  taskDueDate: LocalDate | null;
  /** The task's estimate, for live coverage while a schedule is in flight. */
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
 * One thing on the board. `id` is the React key: a block UUID, or
 * `${seriesId}:${occurrenceDate}` for a virtual occurrence. `blockId` is the
 * row a mutation targets, null for exactly those virtual occurrences.
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
   * The colour stored on the row, or null when the block inherits. Kept beside
   * `color` so the editor round-trips inheritance instead of writing it explicit.
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
   * For a habit block: whether its date is inside the window
   * `record_habit_completion` accepts (yesterday, today, tomorrow in the
   * profile timezone). Server-decided. Always false for other kinds.
   */
  habitRecordable: boolean;
}

/**
 * A task in the planning drawer. The drawer sums the range's own work blocks
 * live and adds `scheduledOutsideMinutes`, so a drop moves coverage in the same frame.
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
 * A habit in the planning drawer. Not a drag source: its schedule already says
 * which days it wants, so its route into the week is "Add to week".
 */
export interface PlanningHabit {
  habit: Habit;
  /** Progress toward the habit's target over the displayed week. */
  progress: HabitProgress;
  /** Dates in the displayed range that already carry a block for it. */
  reservedDates: readonly LocalDate[];
}

/** A weekly goal, read-only in the drawer. */
export interface PlanningGoal {
  id: Uuid;
  title: string | null;
  metric: QuestMetric;
  target: number;
  completedAt: Instant | null;
}

/**
 * The planning drawer's sections. A task appears in exactly one, decided on
 * the server in order OVERDUE, DUE THIS WEEK, UNSCHEDULED — `taskDraggableId`
 * is keyed by task alone, so a duplicate would register the same draggable twice.
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
  /** "Today" in the profile timezone, computed once per request on the server. */
  today: LocalDate;
  items: readonly CalendarItem[];
  plan: PlanningData;
}

/**
 * One item's slice of one day column, in wall-clock minutes from that day's
 * midnight. A midnight-crossing block is two segments.
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

/** A wall-clock span on one day. The unit every interaction produces. */
export interface DaySpan {
  date: LocalDate;
  startMinutes: Minutes;
  endMinutes: Minutes;
}

export type BlockDraft =
  { mode: "create"; span: DaySpan } | { mode: "edit"; item: CalendarItem; span: DaySpan };

/** The settings the whole surface resolves dates and geometry against. */
export interface CalendarSettings {
  timezone: IanaTimeZone;
  weekStart: Weekday;
  snapMinutes: SnapMinutes;
  spec: GridSpec;
}

/** What the grid can ask the board to do; the grid reports intent and never mutates. */
export interface CalendarCallbacks {
  /** Empty space was clicked or a keyboard cursor committed: open a create draft. */
  onCreateAt: (span: DaySpan) => void;
  /** A block was activated (click, Enter): open its editor. */
  onOpenItem: (item: CalendarItem) => void;
  /** The completion control on a work block was used. */
  onToggleComplete: (item: CalendarItem) => void;
  /** Delete, from the block's keyboard shortcut or its editor. */
  onDelete: (item: CalendarItem) => void;
  /**
   * A committed move or resize. A keyboard commit passes the announcement to
   * make once the write lands; the pointer path passes none, because dnd-kit's
   * live region already speaks the drop.
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
  /** Where the grid opens, from `initialScrollMinutes`. */
  scrollToMinutes: Minutes;
  /** The current instant, or null before hydration — drives the now-line only. */
  now: Instant | null;
  /** The span an in-flight drag, resize or keyboard move would commit to. */
  candidate: CandidateSpan | null;
  callbacks: CalendarCallbacks;
  /** Items with a mutation in flight; their blocks read as pending. */
  pendingItemIds: ReadonlySet<string>;
}

/** The provisional span of an interaction in progress; rendered as a placeholder, never written until commit. */
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

/*
 * The grid ↔ interaction seam. `DayColumn` is the droppable, drag-to-create
 * surface and keyboard cursor home; `BlockShell` is the draggable, resize
 * handles, focus target and keyboard move/resize modes. Both take geometry as
 * plain numbers, so neither does date maths.
 */

export interface DayColumnProps {
  date: LocalDate;
  settings: CalendarSettings;
  isToday: boolean;
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
