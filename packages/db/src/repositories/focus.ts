import type { FocusPause, FocusSession, Instant, Minutes, Uuid } from "@momentum/core/types";

import { rowToFocusPause, rowToFocusSession } from "../mappers/focus";
import type { MomentumClient } from "../types";

/**
 * `focus_sessions` and `focus_pauses`.
 *
 * Every function here is a read or an RPC, and there is no third kind: both
 * tables are client-read-only (`20260906121200_grants.sql`), so the only way a
 * row is written is `20260907130000_focus_functions.sql`. That is not a policy
 * that could be relaxed — it is what makes the recorded duration a measurement
 * rather than a claim (Domain Rule 15). A repository function that inserted a
 * session would be a repository function that let the client choose when it
 * started.
 *
 * Note what the RPC wrappers do *not* take: no timestamps, and no XP amount.
 * The database stamps the first and decides the second (Domain Rules 6, 15).
 */

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The account's live session, or null.
 *
 * `focus_sessions_active_uniq` guarantees there is at most one, so this is a
 * `maybeSingle` rather than a list with a warning attached.
 */
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

/**
 * The pause records of one session, oldest first.
 *
 * The timer subtracts these from wall time on every read, so their order is
 * not load-bearing — but a stable one keeps the rendered list stable, and the
 * open pause is always the last.
 */
export async function listPauses(client: MomentumClient, sessionId: Uuid): Promise<FocusPause[]> {
  const { data, error } = await client
    .from("focus_pauses")
    .select("*")
    .eq("session_id", sessionId)
    .order("paused_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToFocusPause);
}

/**
 * Every session that started inside a half-open instant window, newest first.
 *
 * The window is instants, not dates: which local day a session belongs to is a
 * question for `@momentum/core/focus`, which resolves it in the profile
 * timezone (Domain Rule 4). Covered by `focus_sessions_user_started_idx`.
 */
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
 * Focus XP already in the ledger for a window — the day's cap, as the user can
 * see it.
 *
 * `finish_focus_session` computes the cap from the same table inside its own
 * transaction; this read exists so the interface can *state* the rule rather
 * than surprise the user with it. It is a report of what was awarded, never an
 * input to what will be (Domain Rule 6).
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

/* -------------------------------------------------------------------------- */
/* Lifecycle — trusted writes                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Starts the account's one live session.
 *
 * `id` is client-generated (Domain Rule 17): the optimistic row and the
 * persisted row share a key, and a retry after a lost response finds its own
 * session and returns it instead of reporting a conflict with the session it
 * just created.
 *
 * `startedAt` is not a parameter, and that is the point.
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
 * Finishes a session: records its measured minutes on the session and on the
 * linked task, and awards focus XP once, ever.
 *
 * Nothing is returned about the award, deliberately. The ledger row is the
 * record; the page re-reads it. A number handed back here would be a number the
 * client could be tempted to display before the ledger agreed with it.
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
