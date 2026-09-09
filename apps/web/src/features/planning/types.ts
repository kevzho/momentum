import type * as React from "react";

import type { Instant, LocalDate, Uuid } from "@momentum/core/types";

import type {
  CalendarItem,
  CalendarSettings,
  DaySpan,
  PlanningData,
} from "@/features/calendar/types";

/**
 * The planning feature's props contracts (specs/05-week-planning.md).
 *
 * The drawer is a client island beside the calendar board. It owns no server
 * data of its own and performs no mutation: the board hands it the server's
 * sections (`plan`) and the week as the user currently sees it (`items` — the
 * optimistic overlay, not the server's list), and every number the drawer
 * shows is derived from those two by pure functions in
 * `@momentum/core/scheduling`. That is what makes the totals, the bars and
 * the warnings move in the same frame as a drop, and roll back with it.
 *
 * Scheduling — from a drop, from the keyboard dialog, or from a Find Time
 * candidate — reports through one `onScheduleTask(taskId, span)`, the same
 * callback the grid's drop path uses, so every route creates the same block.
 */
export interface PlanningDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * How the drawer is shown. A `panel` sits beside the calendar and takes
   * layout space; a `sheet` slides over it — the below-`lg` form, where the
   * calendar needs the whole width (docs/DESIGN_SYSTEM.md). The board decides
   * from the viewport; the content is the same either way.
   */
  presentation: "panel" | "sheet";
  /**
   * The control that brings the drawer back. Required rather than optional:
   * the drawer's own header button closes it, so pressing it removes the
   * pressed element from the page, and this is not a modal — nothing else
   * restores focus. Without somewhere to send it the browser drops focus on
   * `<body>` and a keyboard user resumes from the top of the shell
   * (Domain Rule 10).
   */
  returnFocusTo: React.RefObject<HTMLElement | null>;
  /** The server's sections and the profile's working hours and focus windows. */
  plan: PlanningData;
  /** The displayed range's blocks as the user sees them right now — the optimistic overlay. */
  items: readonly CalendarItem[];
  settings: CalendarSettings;
  /** The days currently displayed, in order. */
  days: readonly LocalDate[];
  /** Today in the profile timezone, from the server (Domain Rule 4). */
  today: LocalDate;
  /**
   * The current instant after hydration, null before it. Find Time and the
   * insufficient-time check count from it; nothing rendered on the server
   * may depend on it (docs/ARCHITECTURE.md §10).
   */
  now: Instant | null;
  onScheduleTask: (taskId: Uuid, span: DaySpan) => void;
  /**
   * "Add to week" on a habit row (Phase 6).
   *
   * A habit does not drag: its schedule already names the days it wants, so the
   * drawer asks the board to generate this week's blocks rather than placing
   * one. The board owns the call for the same reason it owns `onScheduleTask` —
   * the drawer reports intent and never mutates.
   */
  onAddHabitToWeek: (habitId: Uuid) => void;
  /** Ids whose optimistic scheduling is in flight; their rows read as pending. */
  pendingTaskIds: ReadonlySet<Uuid>;
  /** Habits whose "Add to week" is in flight. */
  pendingHabitIds: ReadonlySet<Uuid>;
}
