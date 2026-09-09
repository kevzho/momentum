import type { Project, Uuid } from "@momentum/core/types";

import { rowToProject } from "../mappers/project";
import type { MomentumClient } from "../types";

/**
 * `projects` — name and colour, which is all anything outside the projects page
 * needs from them.
 *
 * The calendar reads this for two reasons: a block with no colour of its own
 * inherits its project's, and the Plan panel labels a task with the project it
 * belongs to. Both need archived projects too — archiving is how a project ends
 * (`projects.archived_at`), and the tasks and blocks that pointed at it keep
 * pointing at it, so excluding archived rows here would silently drop the
 * colour off historical blocks.
 */
export async function listFor(client: MomentumClient, userId: Uuid): Promise<Project[]> {
  const { data, error } = await client
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return data.map(rowToProject);
}
