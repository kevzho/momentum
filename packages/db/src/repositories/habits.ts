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
 * `habits` and `habit_completions`.
 *
 * The two tables have opposite write models, and the split is Domain Rule 15's:
 *
 * - A **habit** is ordinary user data. Creating, editing and archiving it are
 *   plain statements, scoped by RLS like any other row the user owns.
 * - A **completion** is client-read-only. `20260906121200_grants.sql` gives
 *   `authenticated` `select` on `habit_completions` and nothing else, so every
 *   write below goes through a `security definer` function that computes the
 *   completion date in the profile timezone and awards the XP once
 *   (Domain Rules 4, 6, 14).
 *
 * Habits deliberately have no recurrence rule (docs/ARCHITECTURE.md §11): the
 * blocks "Add to week" writes are ordinary `calendar_blocks` rows and are
 * created through the blocks repository, not here.
 */

/* -------------------------------------------------------------------------- */
/* Habits — reads                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Every habit the page renders, archived ones included.
 *
 * One query rather than two, because archiving is a scope the user switches
 * between rather than a different question, and a person's habit list is a
 * handful of rows. `habits_user_idx (user_id, archived_at)` covers it.
 *
 * Ordered so the active ones lead and the order is stable across renders:
 * archived last, then oldest first, which is roughly the order they were
 * adopted in.
 */
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

/* -------------------------------------------------------------------------- */
/* Habits — writes                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A new habit.
 *
 * `id` comes from the client so the optimistic row and the persisted row share
 * a key and a retried insert collides with itself (Domain Rule 17).
 *
 * The database refuses the combinations that would be meaningless — a
 * `weekdays` habit with no days, a unit on a boolean habit, a target other than
 * 1 on `daily`/`weekdays` — so this shape does not re-state them, and the
 * action maps the constraint names onto sentences.
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

/**
 * One write for the whole form, so a save cannot half-apply.
 *
 * Changing a habit's frequency never touches its completions. The history is
 * what happened; the target is what the user is aiming at now, and re-reading
 * old days against a new rule is exactly the kind of retroactive judgement
 * Domain Rule 7 rules out.
 */
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

/**
 * Archiving: stop tracking, keep everything.
 *
 * `archived_at` is an ordinary column on `habits` — there is no guard on it,
 * because archiving destroys nothing. The completions stay, their XP stays, and
 * un-archiving brings the habit back with its whole history (Domain Rule 7).
 * This is the route a user should reach for; `remove` below is the one that
 * takes the history with it.
 */
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

/**
 * Deletes a habit, and by `on delete cascade` its completions and its calendar
 * blocks — the blocks because they have no meaning without their parent
 * (Domain Rule 13), the completions because they are records *of* it.
 *
 * The XP those completions earned stays: the ledger has no foreign key on
 * `source_id` and outlives its sources by design (Domain Rule 7).
 */
export async function remove(client: MomentumClient, id: Uuid): Promise<void> {
  const { error } = await client.from("habits").delete().eq("id", id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Completions — reads                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Every completion in a date range, for every habit.
 *
 * Both bounds inclusive: `completion_date` is a calendar date, not an instant,
 * so a range is a set of days and the half-open convention that governs block
 * windows does not apply (Domain Rule 4). `habit_completions_user_date_idx`
 * covers it, and one query serves the week strip, the heatmap and every rate on
 * the page — they are all the same rows counted differently.
 */
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

/** The same read for one habit — the long-range heatmap on its detail view. */
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

/* -------------------------------------------------------------------------- */
/* Completions — trusted writes                                               */
/* -------------------------------------------------------------------------- */

/**
 * Records that a habit was done on a user-local date.
 *
 * An RPC and not an insert, and not because of a policy that could be relaxed:
 * the date has to be computed from the profile timezone by something the client
 * cannot lie to, the row has to be the *one* row for that habit and day
 * (Domain Rule 14), and the XP has to be awarded exactly once (Domain Rule 6).
 * All three live in `record_habit_completion`.
 *
 * `onDate` is the day being recorded, not "now": the function stamps
 * `completed_at` with the database clock itself.
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
 * Un-ticks a day. Returns the row that was removed, or null if there was none —
 * removing twice is not an error, so a retry settles on the same state.
 *
 * The function `returns setof`, so "there was nothing to remove" arrives as an
 * empty array rather than as a row of nulls; see the note on
 * `remove_habit_completion` in `20260907120000_habit_functions.sql`.
 *
 * The XP the completion earned is not withdrawn (Domain Rule 7).
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
