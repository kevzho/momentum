import type { Project, ProjectColor, Uuid } from "@momentum/core/types";
import { nowInstant } from "@momentum/core/time";

import { rowToProject } from "../mappers/project";
import type { InsertRow, MomentumClient, UpdateRow } from "../types";

/**
 * Archived projects are included: historical blocks still inherit their colour.
 * A list that should hide them filters on `archivedAt` itself.
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

export async function findById(client: MomentumClient, id: Uuid): Promise<Project | null> {
  const { data, error } = await client.from("projects").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToProject(data);
}

/** `id` comes from the client so a retried insert collides with itself. */
export interface NewProject {
  id?: Uuid;
  userId: Uuid;
  name: string;
  color?: ProjectColor;
}

export interface ProjectPatch {
  name?: string;
  color?: ProjectColor;
}

export async function insert(client: MomentumClient, project: NewProject): Promise<Project> {
  const row: InsertRow<"projects"> = {
    user_id: project.userId,
    name: project.name,
    ...(project.id === undefined ? {} : { id: project.id }),
    ...(project.color === undefined ? {} : { color: project.color }),
  };

  const { data, error } = await client.from("projects").insert(row).select("*").single();

  if (error) throw error;
  return rowToProject(data);
}

export async function update(
  client: MomentumClient,
  id: Uuid,
  patch: ProjectPatch,
): Promise<Project> {
  const row: UpdateRow<"projects"> = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.color === undefined ? {} : { color: patch.color }),
  };

  const { data, error } = await client
    .from("projects")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return rowToProject(data);
}

/**
 * Archiving hides the project from every list and touches nothing else: its
 * tasks keep their `project_id`, and blocks keep inheriting its colour.
 */
export async function setArchived(
  client: MomentumClient,
  id: Uuid,
  archived: boolean,
): Promise<Project> {
  const { data, error } = await client
    .from("projects")
    .update({ archived_at: archived ? nowInstant() : null })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return rowToProject(data);
}
