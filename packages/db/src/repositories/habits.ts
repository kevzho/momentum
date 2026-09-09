import type {
  Habit,
  HabitAmountUnit,
  HabitCompletion,
  HabitFrequencyType,
  LocalDate,
  LocalTime,
  Minutes,
  ProjectColor,
  Uuid,
  Weekday,
} from "@momentum/core/types";
import { nowInstant } from "@momentum/core/time";

import { rowToHabit, rowToHabitCompletion } from "../mappers/habit";
import type { InsertRow, MomentumClient, UpdateRow } from "../types";

/**
 * A habit is ordinary RLS-scoped user data. A completion is client-read-only:
 * every completion write goes through a `security definer` function that
 * resolves the date in the profile timezone and awards XP once.
 */

/** Every habit, archived ones included: active first, then oldest first. */
export async function listFor(client: MomentumClient, userId: Uuid): Promise<Habit[]> {
  const { data, error } = await client
    .from("habits")
    .select("*")
    .eq("user_id", userId)
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(rowToHabit);
}

export async function findById(client: MomentumClient, id: Uuid): Promise<Habit | null> {
  const { data, error } = await client.from("habits").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data === null ? null : rowToHabit(data);
}

/**
 * A client-supplied `id` lets the optimistic and persisted rows share a key.
 * Invalid combinations are refused by database constraints, not re-stated here.
 */
export interface NewHabit {
  id?: Uuid;
  userId: Uuid;
  name: string;
  description?: string | null;
  frequencyType: HabitFrequencyType;
  target?: number;
  unit?: HabitAmountUnit;
  activeDays?: readonly Weekday[];
  preferredStartTime?: LocalTime | null;
  estimatedMinutes?: Minutes | null;
  xpReward?: number;
  color?: ProjectColor | null;
}

/** Every field a habit's editor can change. Archiving has its own function. */
export interface HabitPatch {
  name?: string;
  description?: string | null;
  frequencyType?: HabitFrequencyType;
  target?: number;
  unit?: HabitAmountUnit;
  activeDays?: readonly Weekday[];
  preferredStartTime?: LocalTime | null;
  estimatedMinutes?: Minutes | null;
  xpReward?: number;
  color?: ProjectColor | null;
}

export async function insert(client: MomentumClient, habit: NewHabit): Promise<Habit> {
  const row: InsertRow<"habits"> = {
    user_id: habit.userId,
    name: habit.name,
    frequency_type: habit.frequencyType,
    ...(habit.id === undefined ? {} : { id: habit.id }),
    ...(habit.description === undefined ? {} : { description: habit.description }),
    ...(habit.target === undefined ? {} : { target: habit.target }),
    ...(habit.unit === undefined ? {} : { unit: habit.unit }),
    ...(habit.activeDays === undefined ? {} : { active_days: [...habit.activeDays] }),
    ...(habit.preferredStartTime === undefined
      ? {}
      : { preferred_start_time: habit.preferredStartTime }),
    ...(habit.estimatedMinutes === undefined ? {} : { estimated_minutes: habit.estimatedMinutes }),
    ...(habit.xpReward === undefined ? {} : { xp_reward: habit.xpReward }),
    ...(habit.color === undefined ? {} : { color: habit.color }),
  };

  const { data, error } = await client.from("habits").insert(row).select("*").single();

  if (error) throw error;
  return rowToHabit(data);
}

/** One write for the whole form. Changing frequency never touches completions. */
export async function update(client: MomentumClient, id: Uuid, patch: HabitPatch): Promise<Habit> {
  const row: UpdateRow<"habits"> = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.description === undefined ? {} : { description: patch.description }),
    ...(patch.frequencyType === undefined ? {} : { frequency_type: patch.frequencyType }),
    ...(patch.target === undefined ? {} : { target: patch.target }),
    ...(patch.unit === undefined ? {} : { unit: patch.unit }),
    ...(patch.activeDays === undefined ? {} : { active_days: [...patch.activeDays] }),
    ...(patch.preferredStartTime === undefined
      ? {}
      : { preferred_start_time: patch.preferredStartTime }),
    ...(patch.estimatedMinutes === undefined ? {} : { estimated_minutes: patch.estimatedMinutes }),
    ...(patch.xpReward === undefined ? {} : { xp_reward: patch.xpReward }),
    ...(patch.color === undefined ? {} : { color: patch.color }),
  };

  const { data, error } = await client.from("habits").update(row).eq("id", id).select("*").single();

  if (error) throw error;
  return rowToHabit(data);
}

/** Stops tracking; completions and their XP stay, and un-archiving restores the history. */
export async function setArchived(
  client: MomentumClient,
  id: Uuid,
  archived: boolean,
): Promise<Habit> {
  const { data, error } = await client
    .from("habits")
    .update({ archived_at: archived ? nowInstant() : null })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return rowToHabit(data);
}

/** Deletes a habit; `on delete cascade` removes its completions and blocks. Earned XP stays. */
export async function remove(client: MomentumClient, id: Uuid): Promise<void> {
  const { error } = await client.from("habits").delete().eq("id", id);
  if (error) throw error;
}

/** Every completion in `[from, to]` (both inclusive — `completion_date` is a calendar date). */
export async function listCompletionsBetween(
  client: MomentumClient,
  userId: Uuid,
  from: LocalDate,
  to: LocalDate,
): Promise<HabitCompletion[]> {
  const { data, error } = await client
    .from("habit_completions")
    .select("*")
    .eq("user_id", userId)
    .gte("completion_date", from)
    .lte("completion_date", to)
    .order("completion_date", { ascending: true });

  if (error) throw error;
  return data.map(rowToHabitCompletion);
}

/** The same read for one habit. */
export async function listCompletionsForHabit(
  client: MomentumClient,
  habitId: Uuid,
  from: LocalDate,
  to: LocalDate,
): Promise<HabitCompletion[]> {
  const { data, error } = await client
    .from("habit_completions")
    .select("*")
    .eq("habit_id", habitId)
    .gte("completion_date", from)
    .lte("completion_date", to)
    .order("completion_date", { ascending: true });

  if (error) throw error;
  return data.map(rowToHabitCompletion);
}

/**
 * Records that a habit was done on a user-local date. An RPC, not an insert:
 * one row per habit and day, XP awarded exactly once, `completed_at` stamped
 * by the database clock.
 */
export async function recordCompletion(
  client: MomentumClient,
  habitId: Uuid,
  onDate: LocalDate,
  amount = 1,
  sourceBlockId: Uuid | null = null,
): Promise<HabitCompletion> {
  const { data, error } = await client.rpc("record_habit_completion", {
    p_habit_id: habitId,
    p_on_date: onDate,
    p_amount: amount,
    ...(sourceBlockId === null ? {} : { p_source_block_id: sourceBlockId }),
  });

  if (error) throw error;
  return rowToHabitCompletion(data);
}

/**
 * Un-ticks a day. Returns the removed row, or null if there was none (the
 * function `returns setof`, so "nothing" arrives as an empty array). XP is
 * not withdrawn.
 */
export async function removeCompletion(
  client: MomentumClient,
  habitId: Uuid,
  onDate: LocalDate,
): Promise<HabitCompletion | null> {
  const { data, error } = await client.rpc("remove_habit_completion", {
    p_habit_id: habitId,
    p_on_date: onDate,
  });

  if (error) throw error;
  const row = data?.[0];
  return row === undefined ? null : rowToHabitCompletion(row);
}
