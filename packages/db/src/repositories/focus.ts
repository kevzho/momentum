import type { FocusPause, FocusSession, Instant, Minutes, Uuid } from "@momentum/core/types";

import { rowToFocusPause, rowToFocusSession } from "../mappers/focus";
import type { MomentumClient } from "../types";

/**
 * Both tables are client-read-only; every write is an RPC that stamps its own
 * timestamps and decides its own XP. Never add an insert here.
 */

/** The account's live session, or null; `focus_sessions_active_uniq` guarantees at most one. */
export async function findLive(client: MomentumClient, userId: Uuid): Promise<FocusSession | null> {
  const { data, error } = await client
    .from("focus_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["running", "paused"])
    .maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToFocusSession(data);
}

export async function findById(client: MomentumClient, id: Uuid): Promise<FocusSession | null> {
  const { data, error } = await client
    .from("focus_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToFocusSession(data);
}

/** The pause records of one session, oldest first; the open pause is always last. */
export async function listPauses(client: MomentumClient, sessionId: Uuid): Promise<FocusPause[]> {
  const { data, error } = await client
    .from("focus_pauses")
    .select("*")
    .eq("session_id", sessionId)
    .order("paused_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToFocusPause);
}

/** Every session that started inside `[start, end)`, newest first. */
export async function listStartedBetween(
  client: MomentumClient,
  userId: Uuid,
  window: { start: Instant; end: Instant },
): Promise<FocusSession[]> {
  const { data, error } = await client
    .from("focus_sessions")
    .select("*")
    .eq("user_id", userId)
    .gte("started_at", window.start)
    .lt("started_at", window.end)
    .order("started_at", { ascending: false });

  if (error) throw error;
  return data.map(rowToFocusSession);
}

/**
 * Focus XP already in the ledger for a window. A report of what was awarded,
 * never an input to what will be — `finish_focus_session` computes the cap itself.
 */
export async function focusXpAwardedBetween(
  client: MomentumClient,
  userId: Uuid,
  window: { start: Instant; end: Instant },
): Promise<number> {
  const { data, error } = await client
    .from("xp_events")
    .select("amount")
    .eq("user_id", userId)
    .eq("source_type", "focus_session")
    .gte("created_at", window.start)
    .lt("created_at", window.end);

  if (error) throw error;
  return data.reduce((total, row) => total + row.amount, 0);
}

/**
 * Starts the account's one live session. `id` is client-generated so a retry
 * finds its own session instead of conflicting with it. `startedAt` is
 * deliberately not a parameter.
 */
export async function start(
  client: MomentumClient,
  input: {
    id: Uuid;
    plannedMinutes: Minutes;
    taskId: Uuid | null;
    projectId: Uuid | null;
  },
): Promise<FocusSession> {
  const { data, error } = await client.rpc("start_focus_session", {
    p_id: input.id,
    p_planned_minutes: input.plannedMinutes,
    ...(input.taskId === null ? {} : { p_task_id: input.taskId }),
    ...(input.projectId === null ? {} : { p_project_id: input.projectId }),
  });

  if (error) throw error;
  return rowToFocusSession(data);
}

export async function pause(client: MomentumClient, id: Uuid): Promise<FocusSession> {
  const { data, error } = await client.rpc("pause_focus_session", { p_id: id });

  if (error) throw error;
  return rowToFocusSession(data);
}

export async function resume(client: MomentumClient, id: Uuid): Promise<FocusSession> {
  const { data, error } = await client.rpc("resume_focus_session", { p_id: id });

  if (error) throw error;
  return rowToFocusSession(data);
}

/** Only ever because the user said so; nothing is inferred and nothing is deducted. */
export async function markInterruption(client: MomentumClient, id: Uuid): Promise<FocusSession> {
  const { data, error } = await client.rpc("mark_interruption", { p_id: id });

  if (error) throw error;
  return rowToFocusSession(data);
}

/**
 * Finishes a session: records measured minutes on the session and linked task
 * and awards focus XP once. The award is deliberately not returned; re-read the ledger.
 */
export async function finish(client: MomentumClient, id: Uuid): Promise<FocusSession> {
  const { data, error } = await client.rpc("finish_focus_session", { p_id: id });

  if (error) throw error;
  return rowToFocusSession(data);
}

/** Ends a session early. The minutes are still recorded; no XP, and none removed. */
export async function abandon(client: MomentumClient, id: Uuid): Promise<FocusSession> {
  const { data, error } = await client.rpc("abandon_focus_session", { p_id: id });

  if (error) throw error;
  return rowToFocusSession(data);
}
