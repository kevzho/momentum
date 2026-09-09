import type { Minutes, Uuid } from "@momentum/core/types";

/**
 * `/focus?task=&minutes=`. The keys must match what the task detail sheet, the
 * block editor and Next Up write; the page passes `searchParams` through unchanged.
 */
export interface FocusSearchParams {
  /** A session launched from a task or from its calendar block. */
  task?: string;
  /** The length a calendar block suggested. */
  minutes?: string;
}

/** `?task=` is dropped, not pre-selected, when the picker no longer offers that task. */
export function requestedTaskId(
  params: FocusSearchParams,
  isOffered: (taskId: Uuid) => boolean,
): Uuid | null {
  if (params.task === undefined) return null;
  return isOffered(params.task) ? params.task : null;
}

/** `?minutes=` from a calendar block's own length. Out-of-range values are ignored. */
export function requestedMinutes(params: FocusSearchParams): Minutes | null {
  if (params.minutes === undefined) return null;
  const minutes = Number(params.minutes);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 240 ? minutes : null;
}
