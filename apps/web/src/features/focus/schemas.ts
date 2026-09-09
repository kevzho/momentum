import { z } from "zod";

import { MAX_PLANNED_MINUTES, MIN_PLANNED_MINUTES } from "@momentum/core/focus";

/**
 * The focus feature's input schemas.
 *
 * Note what is not here: no timestamps and no XP amount. The database stamps
 * every time a session carries and decides every point it earns
 * (Domain Rules 6, 15), so there is nothing for a schema to validate — the
 * client's whole vocabulary is "start one this long, on this task", and then
 * an id.
 *
 * `plannedMinutes` mirrors `focus_planned_chk` rather than inventing a second
 * opinion about it, so a length this schema accepts is a row Postgres will
 * store.
 */

const uuid = z.uuid("That is not a valid id.");

/**
 * Starting a session.
 *
 * The id is client-generated (Domain Rule 17). It matters more here than
 * almost anywhere else in the product: a start whose response is lost leaves a
 * *live* session behind, and a retry that minted a fresh id would be told the
 * account already has one — a conflict over a session the user is in the middle
 * of. With the id, the retry finds its own row and the user carries on.
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
