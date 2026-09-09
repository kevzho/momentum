import { afterEach, beforeAll, describe, expect, it } from "vitest";

import * as tasks from "../src/repositories/tasks";
import {
  adminClient,
  DB_TESTS_ENABLED,
  SEED_USERS,
  signIn,
  userIdOf,
  type TestClient,
} from "./support/harness";

/**
 * `profiles.timezone` and `profiles.week_start` are client-writable; these
 * prove that changing them cannot reopen the daily XP caps, spawn extra quest
 * sets, or farm weekly-goal awards. Run with `MOMENTUM_DB_TESTS=1 pnpm exec vitest run --project db`.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

const TASK_DAILY_CAP = 200;

describeDb("security hardening: the timezone/week lever no longer moves rewards", () => {
  let owner: TestClient;
  let neighbour: TestClient;
  let admin: TestClient;
  let ownerId: string;
  let neighbourId: string;

  /** Tasks this suite created, torn down with their ledger rows in afterEach. */
  const createdTasks: string[] = [];
  /** Weekly goals this suite created. */
  const createdGoals: string[] = [];
  /** (userId, timezone) to restore in afterEach. */
  const tzToRestore = new Map<string, string>();

  beforeAll(async () => {
    owner = await signIn(SEED_USERS.owner);
    neighbour = await signIn(SEED_USERS.neighbour);
    admin = adminClient();
    ownerId = await userIdOf(owner);
    neighbourId = await userIdOf(neighbour);
    expect(ownerId).not.toBe(neighbourId);
  });

  afterEach(async () => {
    for (const [userId, timezone] of tzToRestore) {
      await admin.from("profiles").update({ timezone }).eq("id", userId);
    }
    tzToRestore.clear();

    if (createdTasks.length > 0) {
      // The ledger has no FK to tasks, so minted rows go by source id, then the total is reconciled.
      await admin
        .from("xp_events")
        .delete()
        .eq("source_type", "task")
        .in("source_id", createdTasks);
      await admin.from("tasks").delete().in("id", createdTasks);
      await admin.rpc("reconcile_xp", { p_user_id: ownerId });
      await admin.rpc("reconcile_xp", { p_user_id: neighbourId });
      createdTasks.length = 0;
    }
    if (createdGoals.length > 0) {
      await admin.from("weekly_goals").delete().in("id", createdGoals);
      createdGoals.length = 0;
    }
  });

  /**
   * The user's current local week, matching guard_weekly_goals exactly:
   * `(now() at time zone tz)::date` snapped to the week start. `en-CA` formats as YYYY-MM-DD.
   */
  async function currentWeek(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("profiles")
      .select("timezone, week_start")
      .eq("id", userId)
      .single();
    if (error) throw error;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone }).format(new Date());
    const week = await admin.rpc("local_week_start", {
      p_date: today,
      p_week_start: data.week_start,
    });
    if (week.error) throw week.error;
    return week.data as string;
  }

  async function taskXpIn24h(userId: string): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from("xp_events")
      .select("amount")
      .eq("user_id", userId)
      .eq("source_type", "task")
      .gt("created_at", since);
    if (error) throw error;
    return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
  }

  async function completeFreshTask(client: TestClient, userId: string): Promise<void> {
    const id = crypto.randomUUID();
    createdTasks.push(id);
    const { error } = await client
      .from("tasks")
      .insert({ id, user_id: userId, title: "cap probe" });
    if (error) throw error;
    await tasks.complete(client, id);
  }

  it("the daily XP cap cannot be reopened by changing the profile timezone", async () => {
    tzToRestore.set(
      ownerId,
      (await owner.from("profiles").select("timezone").eq("id", ownerId).single()).data!.timezone,
    );

    for (let i = 0; i < Math.ceil(TASK_DAILY_CAP / 10) + 6; i += 1) {
      await completeFreshTask(owner, ownerId);
    }
    const afterFill = await taskXpIn24h(ownerId);
    expect(afterFill).toBeLessThanOrEqual(TASK_DAILY_CAP);

    // Sweep timezones whose local midnight has just passed and complete more work in each.
    for (const timezone of ["Pacific/Kiritimati", "Pacific/Honolulu", "Asia/Kolkata"]) {
      await owner.from("profiles").update({ timezone }).eq("id", ownerId);
      for (let i = 0; i < 4; i += 1) await completeFreshTask(owner, ownerId);
    }

    // The rolling 24h window ignores the timezone, so the total is still bounded.
    expect(await taskXpIn24h(ownerId)).toBeLessThanOrEqual(TASK_DAILY_CAP);
  });

  it("weekly goals cannot be created for a past week, over cap, or re-keyed after the fact", async () => {
    const week = await currentWeek(neighbourId);
    const pastWeek = addDays(week, -30);

    // A past week is refused (22023) at creation: one claimable award per historical week per metric.
    const past = await neighbour.from("weekly_goals").insert({
      id: crypto.randomUUID(),
      user_id: neighbourId,
      week_start: pastWeek,
      metric: "tasks_completed",
      target: 1,
    });
    expect(past.error?.code).toBe("22023");

    // Inserted through the service role so the week guard is out of the way
    // and the check constraint is the sole possible refusal.
    const overCap = await admin.from("weekly_goals").insert({
      id: crypto.randomUUID(),
      user_id: neighbourId,
      week_start: week,
      metric: "tasks_completed",
      target: 100_000,
    });
    expect(overCap.error?.code).toBe("23514");

    const id = crypto.randomUUID();
    createdGoals.push(id);
    const created = await neighbour.from("weekly_goals").insert({
      id,
      user_id: neighbourId,
      week_start: week,
      metric: "blocks_completed",
      target: 1,
    });
    // A pre-existing (week, metric) row from an interrupted run makes
    // uniqueness, not the guard, the refusal.
    if (created.error) expect(created.error.code).toBe("23505");
    else {
      // The award key is frozen: the goal cannot be moved to another week.
      const moved = await neighbour
        .from("weekly_goals")
        .update({ week_start: pastWeek })
        .eq("id", id);
      expect(moved.error?.code).toBe("42501");
    }
  });

  it("quest assignments do not multiply when timezone and week start are swept", async () => {
    // Snapshot both settings: the seed's week_start is 0, not the schema default 1.
    const original = (
      await admin.from("profiles").select("timezone, week_start").eq("id", neighbourId).single()
    ).data!;

    const before = await admin.from("quest_assignments").select("id").eq("user_id", neighbourId);
    const beforeIds = new Set((before.data ?? []).map((row) => row.id));

    try {
      for (const timezone of ["Europe/London", "Pacific/Kiritimati", "Pacific/Honolulu"]) {
        for (let ws = 0; ws <= 6; ws += 1) {
          await neighbour
            .from("profiles")
            .update({ timezone, week_start: ws })
            .eq("id", neighbourId);
          const { error } = await neighbour.rpc("ensure_quest_assignments");
          expect(error).toBeNull();
        }
      }
    } finally {
      await admin
        .from("profiles")
        .update({ timezone: original.timezone, week_start: original.week_start })
        .eq("id", neighbourId);
    }

    // Only assignments whose window (in their own timezone) still contains
    // "now" can be claimed; at most one full set per kind.
    const after = await admin
      .from("quest_assignments")
      .select("id, period, period_start, timezone")
      .eq("user_id", neighbourId);
    const now = Date.now();
    let dailyCurrent = 0;
    let weeklyCurrent = 0;
    for (const row of after.data ?? []) {
      const zone = (row.timezone as string | null) ?? "UTC";
      const len = row.period === "daily" ? 1 : 7;
      const start = zonedMidnight(row.period_start as string, zone);
      const end = zonedMidnight(addDays(row.period_start as string, len), zone);
      if (start <= now && now < end) {
        if (row.period === "daily") dailyCurrent += 1;
        else weeklyCurrent += 1;
      }
    }
    expect(dailyCurrent).toBeLessThanOrEqual(3);
    expect(weeklyCurrent).toBeLessThanOrEqual(2);

    const createdAssignments = (after.data ?? [])
      .map((row) => row.id)
      .filter((id) => !beforeIds.has(id));
    if (createdAssignments.length > 0) {
      await admin.from("quest_assignments").delete().in("id", createdAssignments);
    }
  });
});

/** Midnight of a YYYY-MM-DD date in an IANA zone, as epoch ms. */
function zonedMidnight(date: string, timeZone: string): number {
  // Formatting the UTC midnight in the zone gives the zone's offset, which is subtracted.
  const utcMidnight = new Date(`${date}T00:00:00Z`).getTime();
  const asUtc = new Date(utcMidnight);
  const local = new Date(asUtc.toLocaleString("en-US", { timeZone }));
  const offset = local.getTime() - asUtc.getTime();
  return utcMidnight - offset;
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}
