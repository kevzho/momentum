import type { Minutes } from "../types/scalars";

/** A focus length and a break length. Only the focus half is timed; the break is only named. */
export interface FocusPreset {
  /** Stable key, used in the URL and in the segmented control. */
  id: "25" | "50" | "90";
  focusMinutes: Minutes;
  breakMinutes: Minutes;
}

export const FOCUS_PRESETS: readonly FocusPreset[] = [
  { id: "25", focusMinutes: 25, breakMinutes: 5 },
  { id: "50", focusMinutes: 50, breakMinutes: 10 },
  { id: "90", focusMinutes: 90, breakMinutes: 20 },
];

/** Must match `focus_planned_chk` on `focus_sessions`. */
export const MIN_PLANNED_MINUTES: Minutes = 1;
export const MAX_PLANNED_MINUTES: Minutes = 240;

export function isPlannedMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_PLANNED_MINUTES && value <= MAX_PLANNED_MINUTES;
}

/** The preset a length corresponds to, or null when it is a custom length. */
export function presetForMinutes(minutes: Minutes): FocusPreset | null {
  return FOCUS_PRESETS.find((preset) => preset.focusMinutes === minutes) ?? null;
}
