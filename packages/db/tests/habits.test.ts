import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { addDays, fromLocal, ianaTimeZone, nowInstant, todayIn } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";

import * as habits from "../src/repositories/habits";
import {
  DB_TESTS_ENABLED,
  SEED_USERS,
  adminClient,
  signIn,
  userIdOf,
  type TestClient,
} from "./support/harness";

/**
 * The habits' trusted writes, proved against a real database.
 *
 * Four claims can only be made here, because they are claims about Postgres
 * rather than about TypeScript (docs/ARCHITECTURE.md §13):
 *
 * 1. `habit_completions_uniq` — one row per habit per user-local date — is a
 *    **constraint**, not a UI convention (Domain Rule 14). The suite writes the
 *    same day from both surfaces and counts rows.
 * 2. `completion_date` is a `date` computed in the *profile's* timezone, so a
 *    completion at 23:30 local belongs to that local day whatever UTC says
 *    (Domain Rule 4).
 * 3. XP is awarded once per completion, ever — including across a removal and a
 *    re-record, which is what the deterministic row id exists for
 *    (Domain Rule 6).
 * 4. Nothing is ever withdrawn: removing a completion leaves its XP, and
 *    archiving a habit leaves its whole history (Domain Rule 7).
 *
 * The suite skips itself cleanly without `MOMENTUM_DB_TESTS=1`, so `pnpm test`
 * stays green with no Docker. Run with:
 *   `MOMENTUM_DB_TESTS=1 pnpm test` against a freshly reset stack.
 *
 * Fixtures are created and torn down per test rather than borrowed from the
 * seed, which the RLS suite counts rows in.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

describeDb("habit completion", () => {
  let owner: TestClient;
  let neighbour: TestClient;
  let ownerId: string;
  let admin: TestClient;
  let timezone: ReturnType<typeof ianaTimeZone>;
  let today: LocalDate;

  /** The fixture habit, recreated per test. */
  let habitId: string;

  beforeAll(async () => {
    owner = await signIn(SEED_USERS.owner);
    neighbour = await signIn(SEED_USERS.neighbour);
    ownerId = await userIdOf(owner);
    admin = adminClient();

    /*
     * A known day.
     *
     * Phase 8 caps what one local day can earn from habit completions, and the
     * cap is a property of the *account* — every suite that records a habit
     * completion for today contributes to it, and this one asserts that an
     * award lands. Left alone, the file is green on a fresh database and red on
     * the second run against the same one. Pruning today's habit ledger rows is
     * the harness resetting the day it is about to make claims about; nothing
     * the application can do deletes a ledger row.
     */
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    await admin
      .from("xp_events")
      .delete()
      .eq("user_id", ownerId)
      .eq("source_type", "habit_completion")
      .gte("created_at", startOfToday.toISOString());
    await admin.rpc("reconcile_xp", { p_user_id: ownerId });

    const { data, error } = await owner
      .from("profiles")
      .select("timezone")
      .eq("id", ownerId)
      .single();
    if (error) throw error;

    timezone = ianaTimeZone(data.timezone);
    today = todayIn(timezone, nowInstant());
  });

  beforeEach(async () => {
    const habit = await habits.insert(owner, {
      userId: ownerId,
      name: "Fixture: daily habit",
      frequencyType: "daily",
      xpReward: 7,
    });
    habitId = habit.id;
  });

  afterEach(async () => {
    /*
     * The ledger outlives its sources by design — `xp_events.source_id` has no
     * foreign key — so deleting the habit does not delete the XP it earned, and
     * a suite that runs sixteen completions for one account on one day would
     * otherwise walk into the per-day habit cap Phase 8 added and stop earning
     * part-way through. Removing the fixture's own ledger rows is the harness
     * reaching past the product's front door to undo a fixture, exactly as
     * `focus.test.ts` does, and not a path the application has.
     */
    const { data: completions } = await admin
      .from("habit_completions")
      .select("id")
      .eq("habit_id", habitId);
    for (const row of completions ?? []) {
      await admin.from("xp_events").delete().eq("source_id", row.id);
    }

    // Cascades take the completions and any blocks with it.
    await habits.remove(owner, habitId);
  });

  async function completionRows(): Promise<{ completion_date: string; amount: number }[]> {
    const { data, error } = await owner
      .from("habit_completions")
      .select("completion_date, amount")
      .eq("habit_id", habitId)
      .order("completion_date", { ascending: true });
    if (error) throw error;
    return data;
  }

  async function xpRowsFor(sourceId: string): Promise<number> {
    const { data, error } = await owner
      .from("xp_events")
      .select("id")
      .eq("source_type", "habit_completion")
      .eq("source_id", sourceId);
    if (error) throw error;
    return data.length;
  }

  /* ---------------------------------------------------------------------- */
  /* One row per habit per local date                                       */
  /* ---------------------------------------------------------------------- */

  it("records a day and stores it as a user-local calendar date", async () => {
    const row = await habits.recordCompletion(owner, habitId, today);

    expect(row.completionDate).toBe(today);
    expect(row.amount).toBe(1);
    // A `date` column, never an instant: it round-trips as the day the user
    // was living in, not as a UTC timestamp (Domain Rule 4).
    expect(row.completionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("treats a second completion of a boolean habit on the same day as a no-op", async () => {
    await habits.recordCompletion(owner, habitId, today);
    await habits.recordCompletion(owner, habitId, today);
    await habits.recordCompletion(owner, habitId, today);

    const rows = await completionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(1);
  });

  it("refuses a second row for the same habit and date, at the database", async () => {
    const row = await habits.recordCompletion(owner, habitId, today);

    // The uniqueness is a constraint, not a UI check: writing round the
    // function is refused by the grants, and writing round the grants is
    // impossible for a client at all (Domain Rules 14, 15).
    const { error } = await owner.from("habit_completions").insert({
      habit_id: habitId,
      user_id: ownerId,
      completion_date: today,
      amount: 1,
    });
    expect(error).not.toBeNull();
    expect((await completionRows()).length).toBe(1);
    expect(row.id).toBeDefined();
  });

  it("accumulates within the day for an amount habit, in one row", async () => {
    const amountHabit = await habits.insert(owner, {
      userId: ownerId,
      name: "Fixture: minutes habit",
      frequencyType: "amount_per_day",
      target: 30,
      unit: "minutes",
    });

    await habits.recordCompletion(owner, amountHabit.id, today, 10);
    const second = await habits.recordCompletion(owner, amountHabit.id, today, 20);

    expect(second.amount).toBe(30);

    const { data } = await owner
      .from("habit_completions")
      .select("id")
      .eq("habit_id", amountHabit.id);
    expect(data).toHaveLength(1);

    await habits.remove(owner, amountHabit.id);
  });

  it("records the same row whether the day comes from the page or from a block", async () => {
    // A habit block on today, completed from the calendar, then the same day
    // recorded again from the habits page: one row, not two.
    const startAt = fromLocal(today, 9 * 60, timezone);
    const endAt = fromLocal(today, 10 * 60, timezone);

    const { data: block, error } = await owner
      .from("calendar_blocks")
      .insert({
        user_id: ownerId,
        kind: "habit",
        habit_id: habitId,
        start_at: startAt,
        end_at: endAt,
      })
      .select("id")
      .single();
    if (error) throw error;

    const { error: rpcError } = await owner.rpc("complete_habit_block", { p_block_id: block.id });
    expect(rpcError).toBeNull();

    await habits.recordCompletion(owner, habitId, today);

    expect(await completionRows()).toHaveLength(1);
  });

  /* ---------------------------------------------------------------------- */
  /* The recording window                                                   */
  /* ---------------------------------------------------------------------- */

  it("accepts yesterday, today and tomorrow", async () => {
    const days = [-1, 0, 1].map((offset) => addDays(today, offset));
    for (const day of days) {
      await habits.recordCompletion(owner, habitId, day);
    }
    expect(await completionRows()).toHaveLength(3);
  });

  it("refuses a distant date rather than back-filling history", async () => {
    await expect(
      habits.recordCompletion(owner, habitId, addDays(today, -30)),
    ).rejects.toMatchObject({
      code: "22023",
    });
  });

  /* ---------------------------------------------------------------------- */
  /* XP, once and never withdrawn                                           */
  /* ---------------------------------------------------------------------- */

  it("awards a habit's XP exactly once per completion", async () => {
    const row = await habits.recordCompletion(owner, habitId, today);
    await habits.recordCompletion(owner, habitId, today);

    expect(await xpRowsFor(row.id)).toBe(1);
  });

  it("does not mint a second award when a day is removed and recorded again", async () => {
    // Domain Rule 6: XP is idempotent with respect to the triggering event. The
    // completion's id is derived from (habit, date), so the re-record collides
    // with its own earlier award instead of adding one.
    const first = await habits.recordCompletion(owner, habitId, today);
    await habits.removeCompletion(owner, habitId, today);
    const again = await habits.recordCompletion(owner, habitId, today);

    expect(again.id).toBe(first.id);
    expect(await xpRowsFor(first.id)).toBe(1);
  });

  it("leaves the XP in the ledger when a completion is removed", async () => {
    const row = await habits.recordCompletion(owner, habitId, today);
    await habits.removeCompletion(owner, habitId, today);

    expect(await completionRows()).toHaveLength(0);
    // Nothing is ever taken back (Domain Rule 7); the ledger is append-only.
    expect(await xpRowsFor(row.id)).toBe(1);
  });

  it("removes nothing when the day was never recorded", async () => {
    const removed = await habits.removeCompletion(owner, habitId, today);
    expect(removed).toBeNull();
  });

  /* ---------------------------------------------------------------------- */
  /* Blocks                                                                 */
  /* ---------------------------------------------------------------------- */

  it("completing a habit block records exactly one completion and marks the span", async () => {
    const { data: block, error } = await owner
      .from("calendar_blocks")
      .insert({
        user_id: ownerId,
        kind: "habit",
        habit_id: habitId,
        start_at: fromLocal(today, 7 * 60, timezone),
        end_at: fromLocal(today, 8 * 60, timezone),
      })
      .select("id")
      .single();
    if (error) throw error;

    await owner.rpc("complete_habit_block", { p_block_id: block.id });
    // A retry that lost its response finishes the same job, twice over.
    await owner.rpc("complete_habit_block", { p_block_id: block.id });

    expect(await completionRows()).toHaveLength(1);

    const { data: after } = await owner
      .from("calendar_blocks")
      .select("completed_at")
      .eq("id", block.id)
      .single();
    expect(after?.completed_at).not.toBeNull();
  });

  it("un-completing a block removes only the completion that block created", async () => {
    const { data: block, error } = await owner
      .from("calendar_blocks")
      .insert({
        user_id: ownerId,
        kind: "habit",
        habit_id: habitId,
        start_at: fromLocal(today, 7 * 60, timezone),
        end_at: fromLocal(today, 8 * 60, timezone),
      })
      .select("id")
      .single();
    if (error) throw error;

    // Recorded from the habits page first, so the block did not create the row.
    await habits.recordCompletion(owner, habitId, today);
    await owner.rpc("complete_habit_block", { p_block_id: block.id });
    await owner.rpc("uncomplete_habit_block", { p_block_id: block.id });

    // The day the user ticked themselves survives; only the block is reopened.
    expect(await completionRows()).toHaveLength(1);
    const { data: after } = await owner
      .from("calendar_blocks")
      .select("completed_at")
      .eq("id", block.id)
      .single();
    expect(after?.completed_at).toBeNull();
  });

  it("refuses to record a habit completion from a block that is not a habit block", async () => {
    const { data: task } = await owner
      .from("tasks")
      .insert({ user_id: ownerId, title: "Fixture: not a habit" })
      .select("id")
      .single();

    const { data: block } = await owner
      .from("calendar_blocks")
      .insert({
        user_id: ownerId,
        kind: "work",
        task_id: task?.id ?? null,
        start_at: fromLocal(today, 7 * 60, timezone),
        end_at: fromLocal(today, 8 * 60, timezone),
      })
      .select("id")
      .single();

    const { error } = await owner.rpc("complete_habit_block", { p_block_id: block?.id ?? "" });
    expect(error?.code).toBe("22023");

    if (task?.id) await owner.from("tasks").delete().eq("id", task.id);
  });

  /* ---------------------------------------------------------------------- */
  /* Ownership and archiving                                                */
  /* ---------------------------------------------------------------------- */

  it("refuses to record a completion on another account's habit", async () => {
    await expect(habits.recordCompletion(neighbour, habitId, today)).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("keeps the whole history when a habit is archived", async () => {
    await habits.recordCompletion(owner, habitId, today);
    await habits.recordCompletion(owner, habitId, addDays(today, -1));

    const archived = await habits.setArchived(owner, habitId, true);
    expect(archived.archivedAt).not.toBeNull();
    expect(await completionRows()).toHaveLength(2);

    const restored = await habits.setArchived(owner, habitId, false);
    expect(restored.archivedAt).toBeNull();
    expect(await completionRows()).toHaveLength(2);
  });
});
