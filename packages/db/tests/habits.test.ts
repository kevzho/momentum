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
 * The habits' trusted writes, proved against a real database: one completion
 * per habit per profile-local date, XP awarded once and never withdrawn.
 * Run with `MOMENTUM_DB_TESTS=1 pnpm test`. Fixtures are per test.
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

    // Today's habit cap is a property of the account and survives earlier
    // runs; prune today's habit ledger rows so an award can land. Harness only.
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
    // The ledger outlives its sources, so the fixture's own ledger rows are
    // removed too or the suite walks into the per-day habit cap. Harness only.
    const { data: completions } = await admin
      .from("habit_completions")
      .select("id")
      .eq("habit_id", habitId);
    for (const row of completions ?? []) {
      await admin.from("xp_events").delete().eq("source_id", row.id);
    }

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

  it("records a day and stores it as a user-local calendar date", async () => {
    const row = await habits.recordCompletion(owner, habitId, today);

    expect(row.completionDate).toBe(today);
    expect(row.amount).toBe(1);
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

  it("awards a habit's XP exactly once per completion", async () => {
    const row = await habits.recordCompletion(owner, habitId, today);
    await habits.recordCompletion(owner, habitId, today);

    expect(await xpRowsFor(row.id)).toBe(1);
  });

  it("does not mint a second award when a day is removed and recorded again", async () => {
    // The completion's id is derived from (habit, date), so a re-record
    // collides with its own earlier award.
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
    expect(await xpRowsFor(row.id)).toBe(1);
  });

  it("removes nothing when the day was never recorded", async () => {
    const removed = await habits.removeCompletion(owner, habitId, today);
    expect(removed).toBeNull();
  });

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
