import { z } from "zod";

import { PROJECT_COLORS } from "@momentum/core/types";

// Bounds mirror the database's (`projects_name_chk`, the `project_color` enum).

const uuid = z.uuid("That is not a valid id.");

const name = z
  .string()
  .trim()
  .min(1, "Give the project a name.")
  .max(100, "Names are at most 100 characters.");

const color = z.enum(PROJECT_COLORS, "Pick one of the project colours.");

/** `id` is client-generated so a retry collides with itself. */
export const createProjectInput = z.object({ id: uuid, name, color });

export const updateProjectInput = z.object({ id: uuid, name, color });

export const archiveProjectInput = z.object({ id: uuid, archived: z.boolean() });

export type CreateProjectInput = z.infer<typeof createProjectInput>;
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;
export type ArchiveProjectInput = z.infer<typeof archiveProjectInput>;
