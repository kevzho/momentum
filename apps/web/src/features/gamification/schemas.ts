import { z } from "zod";

import { QUEST_METRICS } from "@momentum/core/types";
import { QUEST_TARGET_CAPS } from "@momentum/core/gamification";

// No schema here carries an amount, a level, a coin count, a progress figure
// or a timestamp: the client names a row and the server decides its worth.

/**
 * The id of a row the database minted. Not `z.uuid()`: a quest assignment's
 * id is `md5(user:quest:period)::uuid`, whose version and variant nibbles are
 * whatever the hash produced, and an RFC 9562 check refuses most of them.
 * `z.guid()` accepts what Postgres's `uuid` type guarantees.
 */
const rowId = z.guid("That is not a valid id.");

export const idInput = z.object({ id: rowId });

export const equipCosmeticInput = z.object({
  id: rowId,
  equipped: z.boolean(),
});

// A target, not a reward. The cap must match `quest_definitions_volume_chk`;
// the database checks it again.
export const createWeeklyGoalInput = z
  .object({
    id: z.uuid(),
    metric: z.enum(QUEST_METRICS),
    target: z.number().int().positive(),
    title: z.string().trim().max(80).nullable(),
  })
  .refine((value) => value.target <= QUEST_TARGET_CAPS.weekly[value.metric], {
    path: ["target"],
    message: "That is more than a week should ask of you. Try a smaller number.",
  });

export type CreateWeeklyGoalInput = z.infer<typeof createWeeklyGoalInput>;
