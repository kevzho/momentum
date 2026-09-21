"use server";

import type { ReminderFeed } from "@/features/reminders/types";
import { getReminderFeed } from "@/features/reminders/queries";
import { failure, success, type ActionResult } from "@/lib/actions/result";

/**
 * The scheduler's periodic re-read while the app stays open, so a task
 * captured in another tab or an event moved on the calendar is reminded of
 * correctly. A read, not a write; it changes nothing.
 */
export async function loadReminderFeed(): Promise<ActionResult<ReminderFeed>> {
  try {
    return success(await getReminderFeed());
  } catch {
    return failure("unavailable", "Momentum could not refresh your reminders.");
  }
}
