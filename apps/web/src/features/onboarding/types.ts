/**
 * The first-run checklist's facts, resolved on the server per request. Null
 * from the query means the checklist is over for this account (finished or
 * skipped) and nothing about it is rendered again.
 */
export interface OnboardingState {
  /** `profiles.working_hours_set_at` is set: the user has saved hours at least once. */
  workingHoursSet: boolean;
  /** Top-level tasks ever captured, whatever their status. */
  taskCount: number;
  /** At least one work block exists, in any week. */
  hasWorkBlock: boolean;
}
