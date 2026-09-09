import { z } from "zod";

import { QUEST_METRICS } from "@momentum/core/types";
import { QUEST_TARGET_CAPS } from "@momentum/core/gamification";

/**
 * What a progress mutation is allowed to say.
 *
 * Note what is missing from every schema here: an amount, a level, a coin
 * count, a progress figure and a timestamp. The client names a row and nothing
 * else; the server decides what that is worth (Domain Rule 6). A field for an
 * amount cannot be forgotten to be validated if it never exists.
 */

/**
 * The id of a row the *database* minted.
 *
 * Not `z.uuid()`. A quest assignment's id is `quest_assignment_id()` —
 * `md5(user:quest:period)::uuid` (Domain Rules §20: the id is a function of the
 * fact, not of the attempt that wrote it) — so its version and variant nibbles
 * are whatever the hash produced, and an RFC 9562 check refuses roughly nine
 * in ten of them. `z.guid()` accepts any 8-4-4-4-12 hex string, which is
 * exactly the shape Postgres's `uuid` type guarantees. The row is still looked
 * up under RLS and the function still recomputes the work, so a looser shape
 * here admits nothing (Domain Rule 6).
 */
const rowId = z.guid("That is not a valid id.");

export const idInput = z.object({ id: rowId });

export const equipCosmeticInput = z.object({
  id: rowId,
  equipped: z.boolean(),
});

/**
 * A weekly goal is the one thing on this surface the user creates, so it is the
 * one place a number arrives from the client — and it is a *target*, not a
 * reward. The cap it is checked against is the same one
 * `quest_definitions_volume_chk` enforces on quests, because a goal that
 * encouraged an unhealthy week would be no better for being self-set
 * (Domain Rule 7). The database checks it again.
 */
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
