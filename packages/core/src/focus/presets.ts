import type { Minutes } from "../types/scalars";

/**
 * The session lengths `specs/07-focus-mode.md` names, plus custom.
 *
 * A preset is a *focus* length and a *break* length. Momentum schedules the
 * focus half and only names the break: nothing here starts a break timer,
 * because a break the product policed would be a capability the product does
 * not have, and a break nobody is timing is exactly what a break is.
 */
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

/**
 * The bounds a custom length has to sit inside.
 *
 * They are `focus_planned_chk`'s bounds, not a second opinion about them: a
 * length this module accepts is a length `focus_sessions` will store, so the
 * form cannot offer a number the database will refuse (the same reasoning as
 * the habit schemas mirroring their own constraints).
 */
export const MIN_PLANNED_MINUTES: Minutes = 1;
export const MAX_PLANNED_MINUTES: Minutes = 240;

export function isPlannedMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_PLANNED_MINUTES && value <= MAX_PLANNED_MINUTES;
}

/** The preset a length corresponds to, or null when it is a custom length. */
export function presetForMinutes(minutes: Minutes): FocusPreset | null {
  return FOCUS_PRESETS.find((preset) => preset.focusMinutes === minutes) ?? null;
}
