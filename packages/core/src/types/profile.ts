import type { IanaTimeZone, Instant, LocalTime, Uuid, Weekday } from "./scalars";

/** A wall-clock window within one day, `start < end`. */
export interface TimeWindow {
  start: LocalTime;
  end: LocalTime;
}

/** Working windows per weekday. A day with no windows is a day off. */
export type WorkingHours = Record<Weekday, TimeWindow[]>;

export const SNAP_MINUTES = [5, 10, 15, 30] as const;
export type SnapMinutes = (typeof SNAP_MINUTES)[number];

/** One row per auth user. `level`, `xp`, and `coins` are written only by trusted database logic (Domain Rule 6). */
export interface Profile {
  id: Uuid;
  displayName: string;
  timezone: IanaTimeZone;
  /** Week start preference; default Monday (`1`). A setting, never a constant (Domain Rule 4). */
  weekStart: Weekday;
  workingHours: WorkingHours;
  /** Preferred deep-focus windows used by Find Time ranking. */
  focusWindows: TimeWindow[];
  /** Calendar snapping increment; default 15. */
  snapMinutes: SnapMinutes;
  level: number;
  xp: number;
  coins: number;
  /**
   * When the user last saved working hours. The stored hours default to
   * Mon–Fri 09:00–17:00, so "has this person set their hours" cannot be read
   * off the hours themselves. Null until the first save.
   */
  workingHoursSetAt: Instant | null;
  /** When the first-run checklist finished or was skipped. Null shows it; once set, it never returns. */
  onboardingDismissedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}
