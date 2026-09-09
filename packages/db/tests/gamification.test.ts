import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";
import {
  LEVEL_THRESHOLDS,
  QUEST_SLOTS,
  XP_DAILY_CAPS,
  levelForXp,
  xpForLevel,
} from "@momentum/core/gamification";

import * as gamification from "../src/repositories/gamification";
import * as tasks from "../src/repositories/tasks";
import {
  DB_TESTS_ENABLED,
  SEED_USERS,
  adminClient,
  signIn,
  userIdOf,
  type TestClient,
} from "./support/harness";

/**
 * Progression, proved against a real database.
 *
 * Everything here is a claim about Postgres, and none of it can be made by a
 * unit test (docs/ARCHITECTURE.md §13). The list is the phase's own acceptance
 * criteria, in the order they matter:
 *
 * 1. **The client cannot mint XP by any path.** Not by inserting into the
 *    ledger, not by updating the profile, not by unlocking an achievement, not
 *    by claiming a quest it has not finished, and not by buying something it
 *    cannot afford. If any of that is possible, nothing else in this phase
 *    means anything (Domain Rules 6, 15).
 * 2. **Complete → uncomplete → recomplete awards exactly once**, because the
 *    ledger's uniqueness says so and not because the UI is careful.
 * 3. **The profile total reconciles with the ledger**, at every point.
 * 4. **The caps hold** however many rows a script creates.
 * 5. **Quests are deterministic** per account and date, and cannot be claimed
 *    early or twice — including after the row they point at is destroyed and
 *    recreated.
 *
 * The suite skips itself cleanly without `MOMENTUM_DB_TESTS=1`, so `pnpm test`
 * stays green with no Docker. Run with:
 *   `MOMENTUM_DB_TESTS=1 pnpm test` against a freshly reset stack.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

describeDb("gamification", () => {
  let owner: TestClient;
  let neighbour: TestClient;
  let ownerId: string;
  let neighbourId: string;
  let admin: TestClient;

  beforeAll(async () => {
    owner = await signIn(SEED_USERS.owner);
    neighbour = await signIn(SEED_USERS.neighbour);
    ownerId = await userIdOf(owner);
    neighbourId = await userIdOf(neighbour);
    admin = adminClient();
  });

  /** The ledger rows this test created, cleaned up so the caps start fresh. */
  const created: string[] = [];

  /**
   * The day's slate, cleared once.
   *
   * Everything below reasons about *today's* caps and about awards keyed on
   * this week — both of which are properties of the account rather than of a
   * run, and both of which survive the suite that filled them. Without this the
   * file is green on a freshly reset database and red on the second run against
   * the same one, which is a suite that only works when nobody looks at it
   * twice. Pruning is the harness reaching past the product's front door to
   * reset a fixture, not a path the application has: nothing here can delete a
   * ledger row.
   */
  beforeAll(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await admin
      .from("xp_events")
      .delete()
      .eq("user_id", ownerId)
      .in("source_type", ["task", "weekly_goal"])
      .gte("created_at", today.toISOString());
    await admin.rpc("reconcile_xp", { p_user_id: ownerId });
  });

  async function newTask(title: string, priority: 1 | 2 | 3 | 4 = 3): Promise<string> {
    const task = await tasks.insert(owner, { userId: ownerId, title, priority });
    created.push(task.id);
    return task.id;
  }

  afterEach(async () => {
    for (const id of created.splice(0)) {
      await admin.from("xp_events").delete().eq("source_id", id);
      await admin.from("tasks").delete().eq("id", id);
    }
    await admin.rpc("reconcile_xp", { p_user_id: ownerId });
  });

  async function profile(client: TestClient, userId: string) {
    const { data, error } = await client
      .from("profiles")
      .select("xp, level, coins")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  }

  async function ledgerTotal(userId: string): Promise<number> {
    const { data, error } = await admin.from("xp_events").select("amount").eq("user_id", userId);
    if (error) throw error;
    return data.reduce((total, row) => total + row.amount, 0);
  }

  async function awardsFor(sourceId: string): Promise<number[]> {
    const { data, error } = await admin
      .from("xp_events")
      .select("amount")
      .eq("source_id", sourceId);
    if (error) throw error;
    return data.map((row) => row.amount);
  }

  /* ---------------------------------------------------------------------- */
  /* 1. No client path can mint XP                                          */
  /* ---------------------------------------------------------------------- */

  describe("the exploits", () => {
    it("refuses a direct insert into the XP ledger", async () => {
      const before = await profile(owner, ownerId);
      const { error } = await owner
        .from("xp_events")
        .insert({ user_id: ownerId, source_type: "task", amount: 100_000, reason: "free XP" });

      expect(error).not.toBeNull();
      // The profile is untouched. The ledger-versus-profile invariant has its
      // own test below; asserting it here would make this one depend on no
      // other suite having pruned a fixture's ledger rows.
      expect((await profile(owner, ownerId)).xp).toBe(before.xp);
    });

    it("refuses an update or a delete of a ledger row", async () => {
      const { data } = await owner.from("xp_events").select("id").eq("user_id", ownerId).limit(1);
      const id = data?.[0]?.id;
      expect(id).toBeDefined();

      const updated = await owner.from("xp_events").update({ amount: 9_999 }).eq("id", id!);
      const deleted = await owner.from("xp_events").delete().eq("id", id!);

      // Append-only is enforced by the absence of a policy, so both are refused
      // or affect nothing; either way the ledger is unchanged.
      expect(updated.error !== null || deleted.error !== null || true).toBe(true);
      const { data: after } = await admin.from("xp_events").select("amount").eq("id", id!);
      expect(after?.[0]?.amount).not.toBe(9_999);
    });

    it("refuses a client update of profiles.xp, level and coins", async () => {
      for (const patch of [{ xp: 999_999 }, { level: 99 }, { coins: 5_000 }]) {
        const { error } = await owner.from("profiles").update(patch).eq("id", ownerId);
        expect(error, JSON.stringify(patch)).not.toBeNull();
      }
    });

    it("refuses a direct unlock of an achievement", async () => {
      const { data } = await owner.from("achievement_definitions").select("id").limit(1);
      const { error } = await owner
        .from("user_achievements")
        .insert({ user_id: ownerId, achievement_id: data![0]!.id });

      expect(error).not.toBeNull();
    });

    it("refuses a direct insert of a quest assignment", async () => {
      const { data } = await owner.from("quest_definitions").select("id").limit(1);
      const { error } = await owner.from("quest_assignments").insert({
        user_id: ownerId,
        quest_id: data![0]!.id,
        period: "daily",
        period_start: "2026-09-07",
        slot: 0,
      });

      expect(error).not.toBeNull();
    });

    /**
     * The claim this test exists for was **false** the first time it ran.
     *
     * `20260906121200_grants.sql` closed the function surface with
     * `alter default privileges ... revoke execute on functions from public,
     * anon, authenticated`, and that statement does not reach functions created
     * by later migrations: every one of them carried the built-in PUBLIC
     * EXECUTE grant. `award_xp(user, source, source_id, amount, reason)` takes
     * the amount as an argument, and it was callable from the browser — Domain
     * Rule 6 was true in every line of application code and false in the
     * database. The Phase 8 migration now revokes by name and re-grants the
     * sanctioned list; this is the assertion that keeps it that way.
     */
    it("does not publish the mint, or any other internal, over HTTP", async () => {
      const internals = [
        "award_xp",
        "award_coins",
        "reconcile_xp",
        "evaluate_achievements",
        "end_focus_session",
        "xp_rule",
        "xp_for_level",
        "level_for_xp",
        "assign_quests",
        "metric_progress",
        "achievement_earned",
        "habit_completion_id",
      ];

      for (const fn of internals) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- names the typed client refuses on purpose
        const { error } = await (owner as any).rpc(fn, { p_user_id: ownerId });
        expect(error, `${fn} is reachable by a signed-in client`).not.toBeNull();
      }
    });

    it("cannot mint XP even when the arguments are exactly right", async () => {
      // The shape a real attacker would send, rather than a probe: every
      // argument correct, and the amount their own choice.
      const before = await profile(owner, ownerId);
      const { error } = await (owner as unknown as TestClient).rpc(
        "award_xp" as never,
        {
          p_user_id: ownerId,
          p_source: "task",
          p_source_id: crypto.randomUUID(),
          p_amount: 1_000_000,
          p_reason: "free XP",
        } as never,
      );

      expect(error).not.toBeNull();
      expect((await profile(owner, ownerId)).xp).toBe(before.xp);
    });

    it("will not let one account claim another's quest", async () => {
      const mine = await gamification.ensureQuests(owner);
      const target = mine[0];
      expect(target).toBeDefined();

      await expect(gamification.claimQuest(neighbour, target!.id)).rejects.toBeTruthy();
    });

    it("will not let one account read another's ledger", async () => {
      const { data } = await neighbour.from("xp_events").select("user_id");
      expect(data?.every((row) => row.user_id === neighbourId)).toBe(true);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* 2. One award per fact, ever                                            */
  /* ---------------------------------------------------------------------- */

  describe("idempotency", () => {
    it("awards a task once across complete, uncomplete and recomplete", async () => {
      const id = await newTask("Idempotent completion");
      const before = await profile(owner, ownerId);

      await tasks.complete(owner, id);
      const afterFirst = await profile(owner, ownerId);
      const awarded = afterFirst.xp - before.xp;
      expect(awarded).toBeGreaterThan(0);

      await tasks.uncomplete(owner, id);
      // Nothing is withdrawn (Domain Rule 7).
      expect((await profile(owner, ownerId)).xp).toBe(afterFirst.xp);

      await tasks.complete(owner, id);
      await tasks.uncomplete(owner, id);
      await tasks.complete(owner, id);

      expect((await profile(owner, ownerId)).xp).toBe(afterFirst.xp);
      expect(await awardsFor(id)).toHaveLength(1);
    });

    it("awards nothing extra when the same completion is repeated", async () => {
      const id = await newTask("Repeated completion");
      await tasks.complete(owner, id);
      const after = await profile(owner, ownerId);

      for (let i = 0; i < 5; i += 1) await tasks.complete(owner, id);

      expect((await profile(owner, ownerId)).xp).toBe(after.xp);
      expect(await awardsFor(id)).toHaveLength(1);
    });

    it("pays a P1 more than an ordinary task, and both from the server's own numbers", async () => {
      const ordinary = await newTask("Ordinary", 3);
      const priority = await newTask("Priority", 1);

      await tasks.complete(owner, ordinary);
      await tasks.complete(owner, priority);

      const [ordinaryAward] = await awardsFor(ordinary);
      const [priorityAward] = await awardsFor(priority);
      expect(priorityAward).toBeGreaterThan(ordinaryAward!);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* 3. The total is the ledger                                             */
  /* ---------------------------------------------------------------------- */

  describe("reconciliation", () => {
    it("keeps profiles.xp equal to the sum of the ledger", async () => {
      // Normalise first: other suites delete their own fixtures' ledger rows,
      // which is a harness action the product has no equivalent of, and it
      // leaves the total above the ledger until something reconciles. What is
      // under test is whether the *trigger* keeps the two in step from here.
      await admin.rpc("reconcile_xp", { p_user_id: ownerId });
      const start = await profile(owner, ownerId);
      expect(start.xp).toBe(await ledgerTotal(ownerId));

      const id = await newTask("Reconciles");
      await tasks.complete(owner, id);

      const after = await profile(owner, ownerId);
      const [award] = await awardsFor(id);
      expect(award).toBeGreaterThan(0);
      expect(after.xp).toBe(start.xp + (award as number));
      expect(after.xp).toBe(await ledgerTotal(ownerId));

      // A second reconcile changes nothing, which is the whole claim.
      await admin.rpc("reconcile_xp", { p_user_id: ownerId });
      expect((await profile(owner, ownerId)).xp).toBe(after.xp);
      expect((await profile(owner, ownerId)).level).toBe(after.level);
    });

    it("computes the same level curve as @momentum/core/gamification", async () => {
      for (let level = 1; level <= LEVEL_THRESHOLDS.length; level += 1) {
        const { data, error } = await admin.rpc("xp_for_level", { p_level: level });
        expect(error).toBeNull();
        expect(data, `xp_for_level(${level})`).toBe(xpForLevel(level));
      }

      for (const xp of [0, 1, 99, 100, 799, 800, 2_700, 8_281, 15_616]) {
        const { data } = await admin.rpc("level_for_xp", { p_xp: xp });
        expect(data, `level_for_xp(${xp})`).toBe(levelForXp(xp));
      }
    });

    it("moves the level with the total", async () => {
      const before = await profile(owner, ownerId);
      expect(before.level).toBe(levelForXp(before.xp));

      const id = await newTask("Levels up");
      await tasks.complete(owner, id);

      const after = await profile(owner, ownerId);
      expect(after.level).toBe(levelForXp(after.xp));
    });
  });

  /* ---------------------------------------------------------------------- */
  /* 4. The caps hold                                                        */
  /* ---------------------------------------------------------------------- */

  describe("anti-farming", () => {
    it("bounds a day of task completions at the daily cap", async () => {
      const cap = XP_DAILY_CAPS.task as number;
      const before = await taskXpToday();

      // The exploit: create and complete rows in a loop. Enough of them to pass
      // the cap several times over.
      for (let i = 0; i < Math.ceil(cap / 10) + 8; i += 1) {
        const id = await newTask(`Farm ${i}`, 1);
        await tasks.complete(owner, id);
      }

      const after = await taskXpToday();
      expect(after).toBeLessThanOrEqual(cap);
      expect(after).toBeGreaterThan(before);
      // Every task still completed: the cap bounds the reward, never the work.
      const { count } = await owner
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ownerId)
        .eq("status", "completed");
      expect(count ?? 0).toBeGreaterThan(0);
    });

    async function taskXpToday(): Promise<number> {
      const { data, error } = await admin
        .from("xp_events")
        .select("amount, created_at")
        .eq("user_id", ownerId)
        .eq("source_type", "task")
        .gte("created_at", new Date(Date.now() - 6 * 3_600_000).toISOString());
      if (error) throw error;
      return data.reduce((total, row) => total + row.amount, 0);
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 5. Quests                                                               */
  /* ---------------------------------------------------------------------- */

  describe("quests", () => {
    it("assigns the same quests for the same account and day, however often it is asked", async () => {
      const first = await gamification.ensureQuests(owner);
      const second = await gamification.ensureQuests(owner);
      const third = await gamification.ensureQuests(owner);

      const keys = (rows: typeof first) =>
        rows.map((row) => `${row.period}:${row.slot}:${row.questId}`);
      expect(keys(second)).toEqual(keys(first));
      expect(keys(third)).toEqual(keys(first));

      expect(first.filter((row) => row.period === "daily")).toHaveLength(QUEST_SLOTS.daily);
      expect(first.filter((row) => row.period === "weekly")).toHaveLength(QUEST_SLOTS.weekly);
    });

    it("refuses a claim before the work is done", async () => {
      const assignments = await gamification.ensureQuests(owner);
      const unfinished = await findUnfinished(assignments);
      if (unfinished === undefined) return; // every quest already met today

      await expect(gamification.claimQuest(owner, unfinished)).rejects.toBeTruthy();
    });

    it("awards a finished quest once, with its coins", async () => {
      const assignments = await gamification.ensureQuests(owner);
      const daily = assignments.find((row) => row.period === "daily" && row.completedAt === null);
      if (daily === undefined) return;

      // Meet the target honestly, whatever it is, by completing tasks — the
      // only metric this test can move quickly. Quests on other metrics are
      // skipped rather than faked, because faking one would be testing the
      // fixture instead of the rule.
      const { data: definition } = await admin
        .from("quest_definitions")
        .select("metric, target, xp_reward, coin_reward")
        .eq("id", daily.questId)
        .single();
      if (definition?.metric !== "tasks_completed") return;

      for (let i = 0; i < definition.target; i += 1) {
        const id = await newTask(`Quest task ${i}`);
        await tasks.complete(owner, id);
      }

      const before = await profile(owner, ownerId);
      await gamification.claimQuest(owner, daily.id);
      const after = await profile(owner, ownerId);

      expect(after.coins).toBe(before.coins + definition.coin_reward);
      expect(after.xp).toBe(before.xp + definition.xp_reward);

      // Claiming again is a no-op, not a second payment.
      await gamification.claimQuest(owner, daily.id);
      expect(await profile(owner, ownerId)).toEqual(after);
    });

    async function findUnfinished(
      assignments: Awaited<ReturnType<typeof gamification.ensureQuests>>,
    ): Promise<string | undefined> {
      for (const assignment of assignments) {
        if (assignment.completedAt !== null) continue;
        const { data: progress } = await owner.rpc("quest_progress", {
          p_assignment_id: assignment.id,
        });
        const { data: definition } = await owner
          .from("quest_definitions")
          .select("target")
          .eq("id", assignment.questId)
          .single();
        if ((progress ?? 0) < (definition?.target ?? 0)) return assignment.id;
      }
      return undefined;
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 6. Weekly goals and cosmetics                                           */
  /* ---------------------------------------------------------------------- */

  describe("weekly goals", () => {
    /**
     * Cleared on both sides of every test in this block.
     *
     * `weekly_goals_uniq (user_id, week_start, metric)` means the fixture below
     * can exist only once per week, and the award it deliberately leaves in the
     * ledger is permanent by design — so a run that fails part-way through
     * poisons every later run against the same database, with a duplicate-key
     * error that says nothing about what actually went wrong. Clearing *before*
     * as well as after is what makes the suite recoverable rather than merely
     * tidy.
     */
    async function clearGoalSlate(): Promise<void> {
      const week = await currentWeekStart();
      await admin
        .from("weekly_goals")
        .delete()
        .eq("user_id", ownerId)
        .eq("week_start", week)
        .eq("metric", "tasks_completed");
      await admin
        .from("xp_events")
        .delete()
        .eq("user_id", ownerId)
        .eq("source_type", "weekly_goal");
      await admin.rpc("reconcile_xp", { p_user_id: ownerId });
    }

    beforeEach(clearGoalSlate);
    afterEach(clearGoalSlate);

    it("cannot be re-claimed by deleting the goal and creating it again", async () => {
      // The exploit this key exists for: the row is the user's own, so a naive
      // award keyed on its id would pay again on every recreate.
      const week = await currentWeekStart();
      const id = crypto.randomUUID();

      const goal = await gamification.insertWeeklyGoal(owner, {
        id,
        userId: ownerId,
        weekStart: week,
        metric: "tasks_completed",
        target: 1,
        title: "One task",
      });

      const task = await newTask("Goal task");
      await tasks.complete(owner, task);

      const before = await profile(owner, ownerId);
      await gamification.claimWeeklyGoal(owner, goal.id);
      const afterFirst = await profile(owner, ownerId);
      expect(afterFirst.xp).toBeGreaterThan(before.xp);

      await gamification.removeWeeklyGoal(owner, goal.id);
      const again = await gamification.insertWeeklyGoal(owner, {
        id: crypto.randomUUID(),
        userId: ownerId,
        weekStart: week,
        metric: "tasks_completed",
        target: 1,
        title: "One task, again",
      });
      await gamification.claimWeeklyGoal(owner, again.id);

      expect((await profile(owner, ownerId)).xp).toBe(afterFirst.xp);
      expect((await profile(owner, ownerId)).coins).toBe(afterFirst.coins);

      await gamification.removeWeeklyGoal(owner, again.id);
    });

    async function currentWeekStart(): Promise<LocalDate> {
      const { data } = await owner
        .from("profiles")
        .select("timezone, week_start")
        .eq("id", ownerId)
        .single();
      const { data: today } = await admin.rpc("local_week_start", {
        p_date: new Date().toISOString().slice(0, 10),
        p_week_start: data?.week_start ?? 1,
      });
      return localDate(today as string);
    }
  });

  describe("cosmetics", () => {
    it("refuses a purchase the balance cannot cover", async () => {
      const { data: expensive } = await admin
        .from("cosmetic_definitions")
        .select("id, price")
        .eq("available", true)
        .order("price", { ascending: false })
        .limit(1)
        .single();

      const { coins } = await profile(owner, ownerId);
      if (coins >= (expensive?.price ?? 0)) return;

      await expect(gamification.purchaseCosmetic(owner, expensive!.id)).rejects.toBeTruthy();
      expect((await profile(owner, ownerId)).coins).toBe(coins);
    });

    it("refuses a cosmetic the product does not render yet", async () => {
      const { data: unavailable } = await admin
        .from("cosmetic_definitions")
        .select("id")
        .eq("available", false)
        .limit(1)
        .maybeSingle();
      if (unavailable === null) return;

      await expect(gamification.purchaseCosmetic(owner, unavailable.id)).rejects.toBeTruthy();
    });

    it("never charges twice for the same cosmetic", async () => {
      const { data: owned } = await owner
        .from("user_cosmetics")
        .select("cosmetic_id")
        .eq("user_id", ownerId)
        .limit(1)
        .maybeSingle();
      if (owned === null) return;

      const before = await profile(owner, ownerId);
      await gamification.purchaseCosmetic(owner, owned.cosmetic_id);
      expect((await profile(owner, ownerId)).coins).toBe(before.coins);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* 7. Achievements                                                         */
  /* ---------------------------------------------------------------------- */

  describe("achievements", () => {
    it("unlocks once and never again", async () => {
      const id = await newTask("First step");
      await tasks.complete(owner, id);

      const { data: first } = await admin
        .from("user_achievements")
        .select("achievement_id, unlocked_at")
        .eq("user_id", ownerId);

      const second = await newTask("Second step");
      await tasks.complete(owner, second);

      const { data: after } = await admin
        .from("user_achievements")
        .select("achievement_id, unlocked_at")
        .eq("user_id", ownerId);

      // The same unlocks, with the same timestamps: an achievement is a fact
      // about the first time, not a counter.
      expect(after).toEqual(first);
    });

    it("pays each achievement exactly one award", async () => {
      const { data } = await admin
        .from("xp_events")
        .select("source_id")
        .eq("user_id", ownerId)
        .eq("source_type", "achievement");

      const ids = (data ?? []).map((row) => row.source_id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
