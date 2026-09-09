"use server";

import { refresh } from "next/cache";

import { projects } from "@momentum/db";
import type { Project } from "@momentum/core/types";

import {
  archiveProjectInput,
  createProjectInput,
  updateProjectInput,
} from "@/features/projects/schemas";
import {
  failure,
  success,
  validationError,
  type ActionErrorCode,
  type ActionResult,
} from "@/lib/actions/result";
import { requireSession } from "@/lib/auth/session";

// `refresh()` is enough: the sidebar, Quick Add and the palette all read
// projects from the `(app)` layout.

export async function createProject(input: unknown): Promise<ActionResult<Project>> {
  const parsed = createProjectInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, name, color } = parsed.data;
  const { supabase, userId } = await requireSession();

  return attempt(async () => {
    try {
      return await projects.insert(supabase, { id, userId, name, color });
    } catch (error) {
      // A retry after a lost response collides with itself on the primary key;
      // that is the retry succeeding.
      if (!isCode(error, UNIQUE_VIOLATION)) throw error;
      const existing = await projects.findById(supabase, id);
      if (existing === null) throw error;
      return existing;
    }
  });
}

export async function updateProject(input: unknown): Promise<ActionResult<Project>> {
  const parsed = updateProjectInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, ...patch } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => projects.update(supabase, id, patch));
}

/** Hides the project from every list. Its tasks keep their `project_id`. */
export async function archiveProject(input: unknown): Promise<ActionResult<Project>> {
  const parsed = archiveProjectInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);

  const { id, archived } = parsed.data;
  const { supabase } = await requireSession();

  return attempt(() => projects.setArchived(supabase, id, archived));
}

const UNIQUE_VIOLATION = "23505";

interface DatabaseError {
  code: string;
  message: string;
}

function isDatabaseError(value: unknown): value is DatabaseError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string" &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

function isCode(error: unknown, code: string): boolean {
  return isDatabaseError(error) && error.code === code;
}

async function attempt<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    refresh();
    return success(data);
  } catch (error) {
    const mapped = describe(error);
    return failure(mapped.code, mapped.message);
  }
}

function describe(error: unknown): { code: ActionErrorCode; message: string } {
  if (!isDatabaseError(error)) {
    return { code: "unavailable", message: "Something went wrong. Please try again." };
  }

  switch (error.code) {
    case "42501":
      return { code: "forbidden", message: "That project belongs to another account." };
    case "P0002":
    case "PGRST116":
      return { code: "not_found", message: "That project no longer exists." };
    case "23514":
      return {
        code: "validation",
        message: error.message.includes("projects_name_chk")
          ? "A project needs a name, and it can be at most 100 characters."
          : error.message,
      };
    case "22P02":
      return { code: "validation", message: "Pick one of the project colours." };
    case UNIQUE_VIOLATION:
      return { code: "conflict", message: "That project already exists." };
    default:
      return {
        code: "unavailable",
        message: "Momentum could not save that change. Please try again.",
      };
  }
}
