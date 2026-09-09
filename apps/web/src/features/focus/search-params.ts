import type { Minutes, Uuid } from "@momentum/core/types";

/**
 * `/focus?task=&minutes=`, read.
 *
 * The keys are the URL's own — the ones the task detail sheet, the block editor
 * and Next Up write — and the page hands `searchParams` here unchanged. The
 * previous shape took a `taskId` the page never sent, so a session launched
 * from a task opened on "No task" every time and the minutes were recorded on
 * nothing (Domain Rule 3); one name on both sides is what makes that
 * impossible to reintroduce.
 */
export interface FocusSearchParams {
  /** A session launched from a task or from its calendar block. */
  task?: string;
  /** The length a calendar block suggested. */
  minutes?: string;
}

/**
 * `?task=` is a request, not an instruction.
 *
 * A link from a task or a calendar block can outlive the task it names — the
 * task may have been completed, archived or deleted in another tab. An id the
 * page cannot resolve is dropped rather than pre-selected, so the picker opens
 * on "no task" instead of on a row that no longer exists.
 */
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
