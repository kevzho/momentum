import { z } from "zod";

import { MAX_PLANNED_MINUTES, MIN_PLANNED_MINUTES } from "@momentum/core/focus";

/**
 * Focus input schemas. No timestamps and no XP amount: the database stamps and
 * decides both. `plannedMinutes` mirrors `focus_planned_chk`.
 */

const uuid = z.uuid("That is not a valid id.");

/**
 * The id is client-generated: a start whose response is lost leaves a live
 * session behind, and a retry with a fresh id would be refused as a conflict.
 */
export const startFocusSessionInput = z.object({
  id: uuid,
  plannedMinutes: z
    .number()
    .int("A session is a whole number of minutes.")
    .min(MIN_PLANNED_MINUTES, "A session is at least a minute.")
    .max(MAX_PLANNED_MINUTES, "A session is at most four hours."),
  taskId: uuid.nullable().default(null),
  projectId: uuid.nullable().default(null),
});

/** Every other lifecycle call names the session and nothing else. */
export const focusSessionInput = z.object({ id: uuid });
