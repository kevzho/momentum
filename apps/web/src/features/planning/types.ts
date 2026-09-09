import type * as React from "react";

import type { Instant, LocalDate, Uuid } from "@momentum/core/types";

import type {
  CalendarItem,
  CalendarSettings,
  DaySpan,
  PlanningData,
} from "@/features/calendar/types";

/**
 * The planning drawer's props. It owns no server data and performs no
 * mutation: every number is derived from `plan` and the optimistic `items`,
 * and every scheduling route reports through `onScheduleTask`.
 */
export interface PlanningDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `panel` sits beside the calendar; `sheet` slides over it below `lg`. */
  presentation: "panel" | "sheet";
  /**
   * The control that brings the drawer back. The drawer's own close button
   * disappears with it and the panel is not a modal, so nothing else restores focus.
   */
  returnFocusTo: React.RefObject<HTMLElement | null>;
  /** The server's sections and the profile's working hours and focus windows. */
  plan: PlanningData;
  /** The displayed range's blocks as the user sees them right now — the optimistic overlay. */
  items: readonly CalendarItem[];
  settings: CalendarSettings;
  /** The days currently displayed, in order. */
  days: readonly LocalDate[];
  /** Today in the profile timezone, from the server. */
  today: LocalDate;
  /** The current instant after hydration, null before it; nothing server-rendered may depend on it. */
  now: Instant | null;
  onScheduleTask: (taskId: Uuid, span: DaySpan) => void;
  /** "Add to week" on a habit row: the board generates this week's blocks. */
  onAddHabitToWeek: (habitId: Uuid) => void;
  /** Ids whose optimistic scheduling is in flight; their rows read as pending. */
  pendingTaskIds: ReadonlySet<Uuid>;
  /** Habits whose "Add to week" is in flight. */
  pendingHabitIds: ReadonlySet<Uuid>;
}
