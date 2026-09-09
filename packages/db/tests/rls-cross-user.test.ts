import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { ianaTimeZone, nowInstant, todayIn } from "@momentum/core/time";

import {
  DB_TESTS_ENABLED,
  SEED_USERS,
  adminClient,
  signIn,
  signInGeneric,
  signedOutGenericClient,
  userIdOf,
  type TestClient,
} from "./support/harness";

/**
 * Cross-user proof: a second account tries, and comes away with nothing.
 *
 * `rls.test.ts` walks every table as the neighbour and shows that plain reads,
 * updates and deletes addressed by the owner's user_id touch nothing. This file
 * is the other half of that proof — the attacks that *pass* a naive policy
 * check and have to be stopped somewhere else:
 *
 *   A. inserting a row with someone else's user_id (WITH CHECK);
 *   B. moving an own row to someone else's account (WITH CHECK, the guards);
 *   C. pointing an own row's foreign key at someone else's row
 *      (`assert_same_owner`, docs/ARCHITECTURE.md §12);
 *   D. calling every sanctioned RPC with an id that belongs to someone else
 *      (`assert_caller`, and no state change afterwards);
 *   E. reaching the functions that are deliberately not granted;
 *   F. reading someone else's per-user rows through a resource embed on a
 *      definition table that everyone may read;
 *   G. side channels: counts, id probes, and error messages that would say
 *      whether a foreign row exists;
 *   H. creating a row already in a guarded state, and writing the
 *      client-read-only tables as their own owner;
 *   I. every granted function, signed out.
 *
 * Every refusal asserts the SQLSTATE rather than "an error happened", and every
 * mutation attempt is followed by a read as the row's owner proving the row is
 * exactly as it was. A test here that fails because the database let the
 * neighbour through is a security finding, not a flaky test.
 *
 * Run with: `MOMENTUM_DB_TESTS=1 pnpm exec vitest run --project db` against the
 * local stack. Everything the suite creates carries a client-generated id and is
 * removed by id in `afterAll`; the seeded rows are only ever read.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

/**
 * SQLSTATE `insufficient_privilege`. RLS `with check`, a missing table or
 * function grant, `assert_caller()`, `assert_same_owner()` and
 * `reject_guarded_write()` all raise it, so it is the one code a refused
 * cross-user attempt is allowed to come back with.
 */
const DENIED = "42501";

/** SQLSTATE `invalid_parameter_value`: a well-formed request refused on its merits. */
const INVALID = "22023";

/** Every table holding user data, with the column that ties a row to its owner. */
const USER_OWNED_TABLES = [
  "profiles",
  "projects",
  "tasks",
  "calendar_blocks",
  "habits",
  "habit_completions",
  "focus_sessions",
  "focus_pauses",
  "xp_events",
  "user_achievements",
  "quest_assignments",
  "weekly_goals",
  "user_cosmetics",
  "weekly_reviews",
] as const;

type UserOwnedTable = (typeof USER_OWNED_TABLES)[number];

function ownerColumn(table: UserOwnedTable): "id" | "user_id" {
  return table === "profiles" ? "id" : "user_id";
}

/** The read-write half of the matrix: tables a signed-in client may insert into. */
const CLIENT_WRITABLE_TABLES = [
  "projects",
  "tasks",
  "calendar_blocks",
  "habits",
  "weekly_goals",
  "weekly_reviews",
] as const;

type ClientWritableTable = (typeof CLIENT_WRITABLE_TABLES)[number];

/** Tables this suite may leave a row in. Every such row is removed by id. */
type FixtureTable = ClientWritableTable | "focus_sessions";

/** A fixed span far in the future, so no "today" query anywhere can see it. */
const SPAN = { start_at: "2031-03-03T10:00:00.000Z", end_at: "2031-03-03T11:00:00.000Z" };
/** A Monday and a Sunday in the same far-off week, for the per-week unique keys. */
const FAR_WEEK_MONDAY = "2031-03-03";
const FAR_WEEK_SUNDAY = "2031-03-02";

interface Outcome {
  data: unknown;
  error: PostgrestError | null;
}

/**
 * The statement was refused with exactly this SQLSTATE. When it was not, the
 * failure says what the database handed back, because a row coming back here
 * is the finding.
 */
function expectRefused(outcome: Outcome, code: string = DENIED): PostgrestError {
  const { error } = outcome;
  if (error === null) {
    throw new Error(
      `expected SQLSTATE ${code}, but the statement succeeded and returned ${JSON.stringify(outcome.data)}`,
    );
  }
  expect(error.code, error.message).toBe(code);
  return error;
}

function first<T>(rows: readonly T[] | null, what: string): T {
  const row = rows?.[0];
  if (row === undefined) throw new Error(`the seed has no ${what}; run \`pnpm db:reset\``);
  return row;
}

async function one<T>(
  query: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`reading ${what}: ${error.message}`);
  return first(data, what);
}

async function all<T>(
  query: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  what: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`reading ${what}: ${error.message}`);
  return data ?? [];
}

describeDb("row-level security: cross-user attempts", () => {
  let owner: TestClient;
  let neighbour: TestClient;
  // Untyped twins for the sweeps that address a table by variable.
  let ownerAny: SupabaseClient;
  let neighbourAny: SupabaseClient;
  let ownerId: string;
  let neighbourId: string;
  /**
   * The owner's current local week start. `weekly_goals` is insertable only for
   * the caller's current week (guard_weekly_goals, 20260909120200), so a fixture
   * or a cross-user attempt has to name it — a far-future week no longer inserts.
   */
  let ownerWeek = "";

  /** The owner's seeded rows, read by the owner and handed to the neighbour. */
  const theirs = {
    openTask: "",
    completedTask: "",
    project: "",
    habit: "",
    habitWithCompletion: { habitId: "", date: "" },
    eventBlock: "",
    workBlockOpen: "",
    workBlockDone: "",
    habitBlock: "",
    seriesBlock: "",
    overrideBlock: "",
    focusSession: "",
    questAssignment: "",
    weeklyGoal: "",
    cosmetic: "",
    /** A cosmetic the owner does *not* own, for the ownership guard. */
    otherCosmetic: "",
    /** An achievement and a quest definition, for the read-only insert shapes. */
    achievementDefinition: "",
    questDefinition: "",
    timezone: "",
  };

  /** Rows the owner created for this run, one per client-writable table. */
  const ownerFixture: Record<ClientWritableTable, string> = {
    projects: "",
    tasks: "",
    calendar_blocks: "",
    habits: "",
    weekly_goals: "",
    weekly_reviews: "",
  };

  /** Rows the neighbour created for this run, whose foreign keys the tests try to re-point. */
  const mine = { project: "", task: "", workBlock: "", event: "", habit: "", habitBlock: "" };

  /** Every id this suite minted, with the table it belongs to, for the teardown. */
  const minted: { table: FixtureTable; id: string }[] = [];
  /** Ledger source ids the ungranted-function probes used. */
  const probeSourceIds: string[] = [];

  function mint(table: FixtureTable): string {
    const id = crypto.randomUUID();
    minted.push({ table, id });
    return id;
  }

  function ok(outcome: { error: PostgrestError | null }, what: string): void {
    if (outcome.error) throw new Error(`${what}: ${outcome.error.code} ${outcome.error.message}`);
  }

  /** A whole row, as its owner sees it, or null. The untyped client, because the table is a variable. */
  async function rowAsOwner(
    client: SupabaseClient,
    table: UserOwnedTable,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`reading ${table} ${id}: ${error.message}`);
    return data as Record<string, unknown> | null;
  }

  async function profileOf(client: TestClient, userId: string) {
    const { data, error } = await client
      .from("profiles")
      .select("id, xp, level, coins")
      .eq("id", userId)
      .single();
    if (error) throw new Error(`reading profile ${userId}: ${error.message}`);
    return data;
  }

  async function countOf(
    client: SupabaseClient,
    table: UserOwnedTable,
    column: string,
    value: string,
  ) {
    const { count, error } = await client
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, value);
    if (error) throw new Error(`counting ${table}: ${error.message}`);
    return count ?? 0;
  }

  beforeAll(async () => {
    owner = await signIn(SEED_USERS.owner);
    neighbour = await signIn(SEED_USERS.neighbour);
    ownerAny = await signInGeneric(SEED_USERS.owner);
    neighbourAny = await signInGeneric(SEED_USERS.neighbour);
    ownerId = await userIdOf(owner);
    neighbourId = await userIdOf(neighbour);
    expect(ownerId).not.toBe(neighbourId);

    // The owner's current local week, computed exactly as guard_weekly_goals
    // does (today in the owner's timezone, snapped to their week start), so
    // weekly-goal fixtures satisfy the current-week rule.
    const ownerProfile = await one(
      owner.from("profiles").select("timezone, week_start").eq("id", ownerId),
      "owner profile",
    );
    const ownerToday = todayIn(ianaTimeZone(ownerProfile.timezone), nowInstant());
    const week = await adminClient().rpc("local_week_start", {
      p_date: ownerToday,
      p_week_start: ownerProfile.week_start,
    });
    if (week.error) throw new Error(`resolving owner week: ${week.error.message}`);
    ownerWeek = week.data as string;

    // ---- The owner's own rows, read through the owner's policies -----------

    theirs.openTask = (
      await one(
        owner
          .from("tasks")
          .select("id")
          .eq("status", "open")
          .is("parent_task_id", null)
          .order("created_at")
          .limit(1),
        "open task",
      )
    ).id;
    theirs.completedTask = (
      await one(
        owner.from("tasks").select("id").eq("status", "completed").limit(1),
        "completed task",
      )
    ).id;
    theirs.project = (
      await one(owner.from("projects").select("id").is("archived_at", null).limit(1), "project")
    ).id;
    theirs.habit = (
      await one(owner.from("habits").select("id").order("created_at").limit(1), "habit")
    ).id;

    const completion = await one(
      owner
        .from("habit_completions")
        .select("habit_id, completion_date")
        .order("completion_date", { ascending: false })
        .limit(1),
      "habit completion",
    );
    theirs.habitWithCompletion = { habitId: completion.habit_id, date: completion.completion_date };

    theirs.eventBlock = (
      await one(
        owner
          .from("calendar_blocks")
          .select("id")
          .eq("kind", "event")
          .is("series_id", null)
          .is("recurrence", null)
          .is("completed_at", null)
          .limit(1),
        "plain event block",
      )
    ).id;
    theirs.workBlockOpen = (
      await one(
        owner
          .from("calendar_blocks")
          .select("id")
          .eq("kind", "work")
          .is("completed_at", null)
          .limit(1),
        "incomplete work block",
      )
    ).id;
    theirs.workBlockDone = (
      await one(
        owner
          .from("calendar_blocks")
          .select("id")
          .eq("kind", "work")
          .not("completed_at", "is", null)
          .limit(1),
        "completed work block",
      )
    ).id;
    theirs.habitBlock = (
      await one(
        owner.from("calendar_blocks").select("id").eq("kind", "habit").limit(1),
        "habit block",
      )
    ).id;
    theirs.seriesBlock = (
      await one(
        owner.from("calendar_blocks").select("id").not("recurrence", "is", null).limit(1),
        "recurring series",
      )
    ).id;
    theirs.overrideBlock = (
      await one(
        owner.from("calendar_blocks").select("id").not("series_id", "is", null).limit(1),
        "series override",
      )
    ).id;
    theirs.focusSession = (
      await one(
        owner
          .from("focus_sessions")
          .select("id")
          .order("started_at", { ascending: false })
          .limit(1),
        "focus session",
      )
    ).id;
    theirs.questAssignment = (
      await one(
        owner
          .from("quest_assignments")
          .select("id")
          .is("completed_at", null)
          .order("period_start", { ascending: false })
          .limit(1),
        "unclaimed quest assignment",
      )
    ).id;
    theirs.weeklyGoal = (
      await one(
        owner
          .from("weekly_goals")
          .select("id")
          .is("completed_at", null)
          .order("week_start", { ascending: false })
          .limit(1),
        "unclaimed weekly goal",
      )
    ).id;
    theirs.cosmetic = (
      await one(owner.from("user_cosmetics").select("cosmetic_id").limit(1), "owned cosmetic")
    ).cosmetic_id;
    theirs.otherCosmetic = (
      await one(
        owner.from("cosmetic_definitions").select("id").neq("id", theirs.cosmetic).limit(1),
        "cosmetic the owner does not own",
      )
    ).id;
    theirs.achievementDefinition = (
      await one(
        owner.from("achievement_definitions").select("id").limit(1),
        "achievement definition",
      )
    ).id;
    theirs.questDefinition = (
      await one(owner.from("quest_definitions").select("id").limit(1), "quest definition")
    ).id;
    theirs.timezone = (
      await one(owner.from("profiles").select("timezone").eq("id", ownerId), "owner profile")
    ).timezone;

    // ---- Rows the owner creates, to try to give away (section B) -----------

    ownerFixture.projects = mint("projects");
    ok(
      await owner
        .from("projects")
        .insert({ id: ownerFixture.projects, user_id: ownerId, name: "RLS proof: owner project" }),
      "owner project fixture",
    );
    // Deliberately without a project: the only thing that can stop the transfer
    // is the policy itself, not assert_same_owner on the project.
    ownerFixture.tasks = mint("tasks");
    ok(
      await owner
        .from("tasks")
        .insert({ id: ownerFixture.tasks, user_id: ownerId, title: "RLS proof: owner task" }),
      "owner task fixture",
    );
    ownerFixture.calendar_blocks = mint("calendar_blocks");
    ok(
      await owner.from("calendar_blocks").insert({
        id: ownerFixture.calendar_blocks,
        user_id: ownerId,
        kind: "event",
        title: "RLS proof: owner event",
        ...SPAN,
      }),
      "owner event fixture",
    );
    ownerFixture.habits = mint("habits");
    ok(
      await owner.from("habits").insert({
        id: ownerFixture.habits,
        user_id: ownerId,
        name: "RLS proof: owner habit",
        frequency_type: "daily",
      }),
      "owner habit fixture",
    );
    ownerFixture.weekly_goals = mint("weekly_goals");
    // Current week (the guard requires it), and a metric the owner has no goal
    // for this week (weekly_goals_uniq is per user+week+metric), so the fixture
    // never collides with a seeded goal and touches no seed row.
    const usedMetrics = new Set(
      (
        await all(
          owner.from("weekly_goals").select("metric").eq("week_start", ownerWeek),
          "owner current-week goals",
        )
      ).map((row) => (row as { metric: string }).metric),
    );
    const freeMetric =
      (
        [
          "blocks_completed",
          "habit_days",
          "habits_completed",
          "priority_tasks_completed",
          "tasks_completed",
          "focus_minutes",
        ] as const
      ).find((metric) => !usedMetrics.has(metric)) ?? "blocks_completed";
    ok(
      await owner.from("weekly_goals").insert({
        id: ownerFixture.weekly_goals,
        user_id: ownerId,
        week_start: ownerWeek,
        metric: freeMetric,
        target: 1,
      }),
      "owner weekly goal fixture",
    );
    ownerFixture.weekly_reviews = mint("weekly_reviews");
    ok(
      await owner
        .from("weekly_reviews")
        .insert({ id: ownerFixture.weekly_reviews, user_id: ownerId, week_start: FAR_WEEK_MONDAY }),
      "owner weekly review fixture",
    );

    // ---- Rows the neighbour creates, whose foreign keys get re-pointed (C) --

    mine.project = mint("projects");
    ok(
      await neighbour
        .from("projects")
        .insert({ id: mine.project, user_id: neighbourId, name: "RLS proof: neighbour project" }),
      "neighbour project fixture",
    );
    mine.task = mint("tasks");
    ok(
      await neighbour.from("tasks").insert({
        id: mine.task,
        user_id: neighbourId,
        project_id: mine.project,
        title: "RLS proof: neighbour task",
      }),
      "neighbour task fixture",
    );
    mine.workBlock = mint("calendar_blocks");
    ok(
      await neighbour.from("calendar_blocks").insert({
        id: mine.workBlock,
        user_id: neighbourId,
        kind: "work",
        task_id: mine.task,
        ...SPAN,
      }),
      "neighbour work block fixture",
    );
    mine.event = mint("calendar_blocks");
    ok(
      await neighbour.from("calendar_blocks").insert({
        id: mine.event,
        user_id: neighbourId,
        kind: "event",
        title: "RLS proof: neighbour event",
        ...SPAN,
      }),
      "neighbour event fixture",
    );
    mine.habit = mint("habits");
    ok(
      await neighbour.from("habits").insert({
        id: mine.habit,
        user_id: neighbourId,
        name: "RLS proof: neighbour habit",
        frequency_type: "daily",
      }),
      "neighbour habit fixture",
    );
    mine.habitBlock = mint("calendar_blocks");
    ok(
      await neighbour.from("calendar_blocks").insert({
        id: mine.habitBlock,
        user_id: neighbourId,
        kind: "habit",
        habit_id: mine.habit,
        ...SPAN,
      }),
      "neighbour habit block fixture",
    );
  });

  afterAll(async () => {
    // The service role, because a row that *did* change hands would be
    // invisible to the account that created it — and that row is precisely the
    // one that must not be left behind.
    const admin = adminClient();
    const failures: string[] = [];
    const idsOf = (table: FixtureTable) =>
      minted.filter((row) => row.table === table).map((row) => row.id);

    try {
      // Ledger rows nothing here should have minted. If any exist, a test above
      // has already failed; removing them keeps the caps honest for the next run.
      const habitIds = idsOf("habits");
      const completionIds =
        habitIds.length === 0
          ? []
          : (
              await all(
                admin.from("habit_completions").select("id").in("habit_id", habitIds),
                "completions",
              )
            ).map((row) => row.id);
      const sourceIds = [...minted.map((row) => row.id), ...completionIds, ...probeSourceIds];
      if (sourceIds.length > 0) {
        const { data: removed, error: ledgerError } = await admin
          .from("xp_events")
          .delete()
          .in("source_id", sourceIds)
          .select("user_id");
        if (ledgerError) failures.push(`xp_events: ${ledgerError.message}`);
        for (const userId of new Set((removed ?? []).map((row) => row.user_id))) {
          const { error } = await admin.rpc("reconcile_xp", { p_user_id: userId });
          if (error) failures.push(`reconcile_xp(${userId}): ${error.message}`);
        }
      }

      // Children before parents. The cascades would manage, but an explicit
      // order names the table when one of these fails.
      const deleters: Record<FixtureTable, (ids: string[]) => PromiseLike<Outcome>> = {
        calendar_blocks: (ids) => admin.from("calendar_blocks").delete().in("id", ids),
        focus_sessions: (ids) => admin.from("focus_sessions").delete().in("id", ids),
        tasks: (ids) => admin.from("tasks").delete().in("id", ids),
        habits: (ids) => admin.from("habits").delete().in("id", ids),
        projects: (ids) => admin.from("projects").delete().in("id", ids),
        weekly_goals: (ids) => admin.from("weekly_goals").delete().in("id", ids),
        weekly_reviews: (ids) => admin.from("weekly_reviews").delete().in("id", ids),
      };
      const order: FixtureTable[] = [
        "calendar_blocks",
        "focus_sessions",
        "tasks",
        "habits",
        "projects",
        "weekly_goals",
        "weekly_reviews",
      ];
      for (const table of order) {
        const ids = idsOf(table);
        if (ids.length === 0) continue;
        const { error } = await deleters[table](ids);
        if (error) failures.push(`${table}: ${error.message}`);
      }
    } finally {
      minted.length = 0;
      probeSourceIds.length = 0;
    }

    if (failures.length > 0) throw new Error(`fixture cleanup failed: ${failures.join("; ")}`);
  });

  /* ---------------------------------------------------------------------- */
  /* A. Inserting a row that claims to be someone else's                     */
  /* ---------------------------------------------------------------------- */

  describe("A. a row inserted with the other account's user_id is refused", () => {
    // Every insert carries every required column and a fresh client id, so the
    // only reason left for the refusal is the user_id (RLS `with check`).
    const insertAsNeighbourForOwner: Record<
      ClientWritableTable,
      (id: string) => PromiseLike<Outcome>
    > = {
      projects: (id) =>
        neighbour.from("projects").insert({ id, user_id: ownerId, name: "RLS proof: planted" }),
      tasks: (id) =>
        neighbour.from("tasks").insert({ id, user_id: ownerId, title: "RLS proof: planted" }),
      calendar_blocks: (id) =>
        neighbour
          .from("calendar_blocks")
          .insert({ id, user_id: ownerId, kind: "event", title: "RLS proof: planted", ...SPAN }),
      habits: (id) =>
        neighbour
          .from("habits")
          .insert({ id, user_id: ownerId, name: "RLS proof: planted", frequency_type: "daily" }),
      weekly_goals: (id) =>
        // The owner's current week, so guard_weekly_goals passes and RLS
        // `with check` is the one thing left to refuse the foreign user_id
        // (42501) — a far week would be rejected first for the wrong reason.
        neighbour.from("weekly_goals").insert({
          id,
          user_id: ownerId,
          week_start: ownerWeek,
          metric: "habit_days",
          target: 1,
        }),
      weekly_reviews: (id) =>
        neighbour
          .from("weekly_reviews")
          .insert({ id, user_id: ownerId, week_start: FAR_WEEK_SUNDAY }),
    };

    it.each(CLIENT_WRITABLE_TABLES)(
      "%s: the insert fails with 42501 and the owner never sees the row",
      async (table) => {
        const id = mint(table);

        expectRefused(await insertAsNeighbourForOwner[table](id));

        // PROVES the row was not created under the owner's account: the owner,
        // whose policy would show it, sees nothing with that id.
        expect(await rowAsOwner(ownerAny, table, id)).toBeNull();
        expect(await rowAsOwner(neighbourAny, table, id)).toBeNull();
      },
    );
  });

  /* ---------------------------------------------------------------------- */
  /* B. Giving an own row away                                               */
  /* ---------------------------------------------------------------------- */

  describe("B. an account cannot transfer its own row to another account", () => {
    it.each(CLIENT_WRITABLE_TABLES)(
      "%s: updating user_id to the neighbour fails with 42501 and the row stays the owner's",
      async (table) => {
        const id = ownerFixture[table];

        // The row passes `using` (it is the owner's) and must fail `with check`
        // (the new user_id is not the caller's). A silent "0 rows" would mean
        // the policy hid the row instead — also a denial, but not this one.
        expectRefused(
          await ownerAny
            .from(table)
            .update({ user_id: neighbourId })
            .eq("id", id)
            .select("user_id"),
        );

        // PROVES nothing moved: the owner still reads the row as their own and
        // the neighbour still cannot see it.
        const after = await rowAsOwner(ownerAny, table, id);
        expect(after?.user_id).toBe(ownerId);
        expect(await rowAsOwner(neighbourAny, table, id)).toBeNull();
      },
    );

    it("profiles: re-keying the profile to the neighbour's id fails with 42501", async () => {
      expectRefused(await owner.from("profiles").update({ id: neighbourId }).eq("id", ownerId));

      // PROVES the profile is untouched and there is still exactly one of each.
      expect((await profileOf(owner, ownerId)).id).toBe(ownerId);
      expect(await countOf(ownerAny, "profiles", "id", ownerId)).toBe(1);
      expect(await countOf(neighbourAny, "profiles", "id", neighbourId)).toBe(1);
    });

    it("user_cosmetics: handing an owned cosmetic to the neighbour fails with 42501", async () => {
      const before = await owner
        .from("user_cosmetics")
        .select("user_id, cosmetic_id, equipped, purchased_at")
        .eq("cosmetic_id", theirs.cosmetic)
        .single();
      ok(before, "owner cosmetic");

      // The ownership guard fires before the policy does; either way, 42501.
      expectRefused(
        await owner
          .from("user_cosmetics")
          .update({ user_id: neighbourId })
          .eq("user_id", ownerId)
          .eq("cosmetic_id", theirs.cosmetic),
      );

      // PROVES the row is byte-for-byte what it was, and the neighbour gained nothing.
      const after = await owner
        .from("user_cosmetics")
        .select("user_id, cosmetic_id, equipped, purchased_at")
        .eq("cosmetic_id", theirs.cosmetic)
        .single();
      expect(after.data).toEqual(before.data);
      const { data: leaked } = await neighbour
        .from("user_cosmetics")
        .select("cosmetic_id")
        .eq("cosmetic_id", theirs.cosmetic)
        .eq("user_id", ownerId);
      expect(leaked).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* C. Foreign keys that cross the account boundary                          */
  /* ---------------------------------------------------------------------- */

  describe("C. a foreign key cannot point at another account's row", () => {
    // Every one of these rows has the neighbour's own user_id, so the policy
    // accepts it; `assert_same_owner` is what has to say no.

    it("calendar_blocks.task_id: a work block on the owner's task is refused (insert)", async () => {
      const id = mint("calendar_blocks");
      expectRefused(
        await neighbour
          .from("calendar_blocks")
          .insert({ id, user_id: neighbourId, kind: "work", task_id: theirs.openTask, ...SPAN }),
      );
      expect(await rowAsOwner(neighbourAny, "calendar_blocks", id)).toBeNull();
    });

    it("calendar_blocks.habit_id: a habit block on the owner's habit is refused (insert)", async () => {
      const id = mint("calendar_blocks");
      expectRefused(
        await neighbour
          .from("calendar_blocks")
          .insert({ id, user_id: neighbourId, kind: "habit", habit_id: theirs.habit, ...SPAN }),
      );
      expect(await rowAsOwner(neighbourAny, "calendar_blocks", id)).toBeNull();
    });

    it("calendar_blocks.series_id: an override of the owner's series is refused (insert)", async () => {
      const id = mint("calendar_blocks");
      expectRefused(
        await neighbour.from("calendar_blocks").insert({
          id,
          user_id: neighbourId,
          kind: "event",
          title: "RLS proof: hijacked occurrence",
          series_id: theirs.seriesBlock,
          occurrence_date: FAR_WEEK_MONDAY,
          ...SPAN,
        }),
      );
      expect(await rowAsOwner(neighbourAny, "calendar_blocks", id)).toBeNull();
    });

    it("tasks.project_id: a task filed under the owner's project is refused (insert)", async () => {
      const id = mint("tasks");
      expectRefused(
        await neighbour
          .from("tasks")
          .insert({ id, user_id: neighbourId, project_id: theirs.project, title: "RLS proof" }),
      );
      expect(await rowAsOwner(neighbourAny, "tasks", id)).toBeNull();
    });

    it("tasks.parent_task_id: a subtask under the owner's task is refused (insert)", async () => {
      const id = mint("tasks");
      expectRefused(
        await neighbour.from("tasks").insert({
          id,
          user_id: neighbourId,
          parent_task_id: theirs.openTask,
          title: "RLS proof",
        }),
      );
      expect(await rowAsOwner(neighbourAny, "tasks", id)).toBeNull();
      // PROVES the owner's task did not acquire a child it cannot see.
      const { data: children } = await owner
        .from("tasks")
        .select("id")
        .eq("parent_task_id", theirs.openTask)
        .eq("id", id);
      expect(children).toEqual([]);
    });

    it("calendar_blocks.task_id: re-pointing an own work block at the owner's task is refused (update)", async () => {
      expectRefused(
        await neighbour
          .from("calendar_blocks")
          .update({ task_id: theirs.openTask })
          .eq("id", mine.workBlock)
          .select("task_id"),
      );
      const after = await rowAsOwner(neighbourAny, "calendar_blocks", mine.workBlock);
      expect(after?.task_id).toBe(mine.task);
    });

    it("calendar_blocks.habit_id: re-pointing an own habit block at the owner's habit is refused (update)", async () => {
      expectRefused(
        await neighbour
          .from("calendar_blocks")
          .update({ habit_id: theirs.habit })
          .eq("id", mine.habitBlock)
          .select("habit_id"),
      );
      const after = await rowAsOwner(neighbourAny, "calendar_blocks", mine.habitBlock);
      expect(after?.habit_id).toBe(mine.habit);
    });

    it("calendar_blocks.series_id: turning an own event into an override of the owner's series is refused (update)", async () => {
      expectRefused(
        await neighbour
          .from("calendar_blocks")
          .update({ series_id: theirs.seriesBlock, occurrence_date: FAR_WEEK_MONDAY })
          .eq("id", mine.event)
          .select("series_id"),
      );
      const after = await rowAsOwner(neighbourAny, "calendar_blocks", mine.event);
      expect(after?.series_id).toBeNull();
      expect(after?.occurrence_date).toBeNull();
    });

    it("tasks.project_id: moving an own task into the owner's project is refused (update)", async () => {
      expectRefused(
        await neighbour
          .from("tasks")
          .update({ project_id: theirs.project })
          .eq("id", mine.task)
          .select("project_id"),
      );
      const after = await rowAsOwner(neighbourAny, "tasks", mine.task);
      expect(after?.project_id).toBe(mine.project);
    });

    it("tasks.parent_task_id: nesting an own task under the owner's task is refused (update)", async () => {
      expectRefused(
        await neighbour
          .from("tasks")
          .update({ parent_task_id: theirs.openTask })
          .eq("id", mine.task)
          .select("parent_task_id"),
      );
      const after = await rowAsOwner(neighbourAny, "tasks", mine.task);
      expect(after?.parent_task_id).toBeNull();
      // `enforce_subtask_depth` copies the parent's project onto a subtask; the
      // refused statement must not have left that side effect behind either.
      expect(after?.project_id).toBe(mine.project);
    });

    it("record_habit_completion: an own habit cannot cite the owner's block as its source", async () => {
      const today = todayIn(ianaTimeZone("Europe/London"), nowInstant());
      const before = await countOf(neighbourAny, "habit_completions", "habit_id", mine.habit);

      // The date is inside the recording window, so the only thing left to
      // refuse is the block — the function checks it explicitly, because RLS
      // is not consulted inside a security definer body.
      const error = expectRefused(
        await neighbour.rpc("record_habit_completion", {
          p_habit_id: mine.habit,
          p_on_date: today,
          p_amount: 1,
          p_source_block_id: theirs.habitBlock,
        }),
        INVALID,
      );
      expect(error.message).toMatch(/is not a block of habit/);

      // PROVES no completion was recorded on the way to the refusal.
      expect(await countOf(neighbourAny, "habit_completions", "habit_id", mine.habit)).toBe(before);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* D. The sanctioned functions, called with someone else's id              */
  /* ---------------------------------------------------------------------- */

  describe("D. every granted function refuses another account's row and changes nothing", () => {
    // Each case: the owner reads the row, the neighbour calls the function with
    // that row's id, the owner reads the row again. 42501 comes from
    // assert_caller(); the two reads must be identical.

    it("complete_task(owner's open task) → 42501; the task stays open", async () => {
      const before = await rowAsOwner(ownerAny, "tasks", theirs.openTask);
      const xp = await profileOf(owner, ownerId);
      expect(before?.status).toBe("open");

      expectRefused(await neighbour.rpc("complete_task", { p_task_id: theirs.openTask }));

      expect(await rowAsOwner(ownerAny, "tasks", theirs.openTask)).toEqual(before);
      expect(await profileOf(owner, ownerId)).toEqual(xp);
    });

    it("uncomplete_task(owner's completed task) → 42501; the task stays completed", async () => {
      const before = await rowAsOwner(ownerAny, "tasks", theirs.completedTask);
      expect(before?.status).toBe("completed");

      expectRefused(await neighbour.rpc("uncomplete_task", { p_task_id: theirs.completedTask }));

      expect(await rowAsOwner(ownerAny, "tasks", theirs.completedTask)).toEqual(before);
    });

    it("complete_block(owner's open work block, false) → 42501; the block stays open", async () => {
      const before = await rowAsOwner(ownerAny, "calendar_blocks", theirs.workBlockOpen);
      expect(before?.completed_at).toBeNull();

      expectRefused(
        await neighbour.rpc("complete_block", {
          p_block_id: theirs.workBlockOpen,
          p_also_complete_task: false,
        }),
      );

      expect(await rowAsOwner(ownerAny, "calendar_blocks", theirs.workBlockOpen)).toEqual(before);
    });

    it("complete_block(owner's open work block, true) → 42501; neither the block nor its task moves", async () => {
      const block = await rowAsOwner(ownerAny, "calendar_blocks", theirs.workBlockOpen);
      const taskId = block?.task_id;
      expect(typeof taskId).toBe("string");
      const task = await rowAsOwner(ownerAny, "tasks", String(taskId));

      expectRefused(
        await neighbour.rpc("complete_block", {
          p_block_id: theirs.workBlockOpen,
          p_also_complete_task: true,
        }),
      );

      expect(await rowAsOwner(ownerAny, "calendar_blocks", theirs.workBlockOpen)).toEqual(block);
      expect(await rowAsOwner(ownerAny, "tasks", String(taskId))).toEqual(task);
    });

    it("uncomplete_block(owner's completed work block, false) → 42501; the block stays completed", async () => {
      const before = await rowAsOwner(ownerAny, "calendar_blocks", theirs.workBlockDone);
      expect(before?.completed_at).not.toBeNull();

      expectRefused(
        await neighbour.rpc("uncomplete_block", {
          p_block_id: theirs.workBlockDone,
          p_also_uncomplete_task: false,
        }),
      );

      expect(await rowAsOwner(ownerAny, "calendar_blocks", theirs.workBlockDone)).toEqual(before);
    });

    it("complete_habit_block(owner's habit block) → 42501; no block change, no completion", async () => {
      const block = await rowAsOwner(ownerAny, "calendar_blocks", theirs.habitBlock);
      const habitId = String(block?.habit_id);
      const completions = await countOf(ownerAny, "habit_completions", "habit_id", habitId);
      const xp = await profileOf(owner, ownerId);

      expectRefused(await neighbour.rpc("complete_habit_block", { p_block_id: theirs.habitBlock }));

      expect(await rowAsOwner(ownerAny, "calendar_blocks", theirs.habitBlock)).toEqual(block);
      expect(await countOf(ownerAny, "habit_completions", "habit_id", habitId)).toBe(completions);
      expect(await profileOf(owner, ownerId)).toEqual(xp);
    });

    it("uncomplete_habit_block(owner's habit block) → 42501; no block change, no completion removed", async () => {
      const block = await rowAsOwner(ownerAny, "calendar_blocks", theirs.habitBlock);
      const habitId = String(block?.habit_id);
      const completions = await countOf(ownerAny, "habit_completions", "habit_id", habitId);

      expectRefused(
        await neighbour.rpc("uncomplete_habit_block", { p_block_id: theirs.habitBlock }),
      );

      expect(await rowAsOwner(ownerAny, "calendar_blocks", theirs.habitBlock)).toEqual(block);
      expect(await countOf(ownerAny, "habit_completions", "habit_id", habitId)).toBe(completions);
    });

    it("record_habit_completion(owner's habit, today) → 42501; no completion, no XP", async () => {
      const today = todayIn(ianaTimeZone(theirs.timezone), nowInstant());
      const completions = await countOf(ownerAny, "habit_completions", "habit_id", theirs.habit);
      const xp = await profileOf(owner, ownerId);

      expectRefused(
        await neighbour.rpc("record_habit_completion", {
          p_habit_id: theirs.habit,
          p_on_date: today,
          p_amount: 1,
        }),
      );

      expect(await countOf(ownerAny, "habit_completions", "habit_id", theirs.habit)).toBe(
        completions,
      );
      expect(await profileOf(owner, ownerId)).toEqual(xp);
    });

    it("remove_habit_completion(owner's habit, a day they completed) → 42501; the completion survives", async () => {
      const { habitId, date } = theirs.habitWithCompletion;
      const before = await all(
        owner
          .from("habit_completions")
          .select("id, amount, source_block_id")
          .eq("habit_id", habitId)
          .eq("completion_date", date),
        "owner completion",
      );
      expect(before).toHaveLength(1);

      expectRefused(
        await neighbour.rpc("remove_habit_completion", { p_habit_id: habitId, p_on_date: date }),
      );

      const after = await all(
        owner
          .from("habit_completions")
          .select("id, amount, source_block_id")
          .eq("habit_id", habitId)
          .eq("completion_date", date),
        "owner completion",
      );
      expect(after).toEqual(before);
    });

    it("start_focus_session(…, owner's task) → 42501; no session is created", async () => {
      const id = mint("focus_sessions");

      expectRefused(
        await neighbour.rpc("start_focus_session", {
          p_planned_minutes: 25,
          p_id: id,
          p_task_id: theirs.openTask,
        }),
      );

      // PROVES no row: the session would be the neighbour's own, so the neighbour would see it.
      expect(await rowAsOwner(neighbourAny, "focus_sessions", id)).toBeNull();
    });

    it("start_focus_session(…, owner's project) → 42501; no session is created", async () => {
      const id = mint("focus_sessions");

      // The body does not check the project itself; the insert trigger
      // (assert_same_owner on focus_sessions.project_id) is what refuses it.
      const error = expectRefused(
        await neighbour.rpc("start_focus_session", {
          p_planned_minutes: 25,
          p_id: id,
          p_project_id: theirs.project,
        }),
      );
      expect(error.message).toMatch(/project_id must reference a row owned by the same user/);

      expect(await rowAsOwner(neighbourAny, "focus_sessions", id)).toBeNull();
    });

    it("start_focus_session(…, p_id = owner's existing session) → 42501; the retry path cannot adopt it", async () => {
      const before = await rowAsOwner(ownerAny, "focus_sessions", theirs.focusSession);

      expectRefused(
        await neighbour.rpc("start_focus_session", {
          p_planned_minutes: 25,
          p_id: theirs.focusSession,
        }),
      );

      expect(await rowAsOwner(ownerAny, "focus_sessions", theirs.focusSession)).toEqual(before);
      expect(await rowAsOwner(neighbourAny, "focus_sessions", theirs.focusSession)).toBeNull();
    });

    it.each([
      "pause_focus_session",
      "resume_focus_session",
      "mark_interruption",
      "finish_focus_session",
      "abandon_focus_session",
    ] as const)("%s(owner's session) → 42501; the session is untouched", async (fn) => {
      // assert_caller runs before the status check in every one of these, so
      // the code is 42501 whether the session is live or long finished.
      const before = await rowAsOwner(ownerAny, "focus_sessions", theirs.focusSession);
      const pauses = await countOf(ownerAny, "focus_pauses", "session_id", theirs.focusSession);
      const xp = await profileOf(owner, ownerId);

      expectRefused(await neighbour.rpc(fn, { p_id: theirs.focusSession }));

      expect(await rowAsOwner(ownerAny, "focus_sessions", theirs.focusSession)).toEqual(before);
      expect(await countOf(ownerAny, "focus_pauses", "session_id", theirs.focusSession)).toBe(
        pauses,
      );
      expect(await profileOf(owner, ownerId)).toEqual(xp);
    });

    it("claim_quest(owner's assignment) → 42501; the assignment, XP and coins are untouched", async () => {
      const before = await rowAsOwner(ownerAny, "quest_assignments", theirs.questAssignment);
      const xp = await profileOf(owner, ownerId);

      expectRefused(
        await neighbour.rpc("claim_quest", { p_assignment_id: theirs.questAssignment }),
      );

      expect(await rowAsOwner(ownerAny, "quest_assignments", theirs.questAssignment)).toEqual(
        before,
      );
      expect(await profileOf(owner, ownerId)).toEqual(xp);
    });

    it("quest_progress(owner's assignment) → 42501 and returns no number", async () => {
      // This one returns data. It must return none: the count of another
      // person's completed tasks is their data too.
      const outcome = await neighbour.rpc("quest_progress", {
        p_assignment_id: theirs.questAssignment,
      });
      expectRefused(outcome);
      expect(outcome.data).toBeNull();
    });

    it("claim_weekly_goal(owner's goal) → 42501; the goal, XP and coins are untouched", async () => {
      const before = await rowAsOwner(ownerAny, "weekly_goals", theirs.weeklyGoal);
      const xp = await profileOf(owner, ownerId);

      expectRefused(await neighbour.rpc("claim_weekly_goal", { p_goal_id: theirs.weeklyGoal }));

      expect(await rowAsOwner(ownerAny, "weekly_goals", theirs.weeklyGoal)).toEqual(before);
      expect(await profileOf(owner, ownerId)).toEqual(xp);
    });

    it("weekly_goal_progress(owner's goal) → 42501 and returns no number", async () => {
      const outcome = await neighbour.rpc("weekly_goal_progress", { p_goal_id: theirs.weeklyGoal });
      expectRefused(outcome);
      expect(outcome.data).toBeNull();
    });

    it("purchase_cosmetic: a caller who cannot afford it is refused and keeps their coins", async ({
      skip,
    }) => {
      // purchase_cosmetic acts on the caller only, so there is no cross-user
      // id to pass. What can be proved is that the price is enforced against
      // the caller's real balance and nothing is granted on refusal.
      const before = await profileOf(neighbour, neighbourId);
      const owned = (
        await all(neighbour.from("user_cosmetics").select("cosmetic_id"), "neighbour cosmetics")
      ).map((row) => row.cosmetic_id);
      const forSale = await all(
        neighbour
          .from("cosmetic_definitions")
          .select("id, price")
          .eq("available", true)
          .order("price", { ascending: true }),
        "cosmetics for sale",
      );
      const target = forSale.find((row) => !owned.includes(row.id));
      if (!target) return skip("the neighbour already owns every cosmetic for sale");
      if (before.coins >= target.price) {
        return skip(
          `the neighbour has ${before.coins} coins and can afford the ${target.price}-coin cosmetic`,
        );
      }

      const error = expectRefused(
        await neighbour.rpc("purchase_cosmetic", { p_cosmetic_id: target.id }),
        INVALID,
      );
      expect(error.message).toMatch(/costs/);

      expect(await profileOf(neighbour, neighbourId)).toEqual(before);
      const { data: granted } = await neighbour
        .from("user_cosmetics")
        .select("cosmetic_id")
        .eq("cosmetic_id", target.id);
      expect(granted).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* E. The functions that are not granted                                    */
  /* ---------------------------------------------------------------------- */

  describe("E. the internal functions are unreachable over PostgREST", () => {
    // The mint, the reconciler, the evaluator, the assigner, the ownership
    // check and the metric — each takes a user id or an amount as an argument,
    // which is exactly why none of them may be an endpoint (Domain Rule 6).
    const UNGRANTED = [
      {
        fn: "award_xp",
        args: () => {
          const sourceId = crypto.randomUUID();
          probeSourceIds.push(sourceId);
          return {
            p_user_id: neighbourId,
            p_source: "task",
            p_source_id: sourceId,
            p_amount: 1000,
            p_reason: "RLS proof",
          };
        },
      },
      { fn: "award_coins", args: () => ({ p_user_id: neighbourId, p_amount: 1000 }) },
      { fn: "reconcile_xp", args: () => ({ p_user_id: ownerId }) },
      { fn: "evaluate_achievements", args: () => ({ p_user_id: neighbourId }) },
      {
        fn: "assign_quests",
        args: () => ({
          p_user_id: neighbourId,
          p_period: "daily",
          p_period_start: FAR_WEEK_MONDAY,
        }),
      },
      { fn: "assert_caller", args: () => ({ p_user_id: neighbourId }) },
      {
        fn: "metric_progress",
        args: () => ({
          p_user_id: ownerId,
          p_metric: "tasks_completed",
          p_from: "2020-01-01",
          p_to: "2031-01-01",
        }),
      },
      {
        fn: "end_focus_session",
        args: () => ({ p_id: theirs.focusSession, p_status: "completed" }),
      },
    ] as const;

    it.each(UNGRANTED)(
      "$fn: a signed-in account gets 42501 (permission denied)",
      async ({ fn, args }) => {
        const before = await profileOf(neighbour, neighbourId);

        const error = expectRefused(await neighbourAny.rpc(fn, args()));
        expect(error.message).toMatch(/permission denied for function/);

        // PROVES the call did not run: the caller's own totals are unchanged.
        expect(await profileOf(neighbour, neighbourId)).toEqual(before);
      },
    );

    it.each(UNGRANTED)(
      "$fn: a signed-out client gets 42501 (permission denied)",
      async ({ fn, args }) => {
        const error = expectRefused(await signedOutGenericClient().rpc(fn, args()));
        expect(error.message).toMatch(/permission denied for function/);
      },
    );

    it("no probe reached the ledger", async () => {
      // award_xp was called with fresh source ids; had any call landed, the
      // caller could read the row back in their own ledger.
      expect(probeSourceIds.length).toBeGreaterThan(0);
      const { data, error } = await neighbour
        .from("xp_events")
        .select("id")
        .in("source_id", probeSourceIds);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* F. Resource embedding through shared definition tables                   */
  /* ---------------------------------------------------------------------- */

  describe("F. an embed on a shared definition table returns only the caller's rows", () => {
    // Definition tables are readable by everyone signed in, and PostgREST will
    // happily embed the per-user table behind them. The embedded rows must be
    // filtered by the per-user policy — and the totals must match a direct
    // read of the caller's own rows, so nothing of the owner's is mixed in.

    it("achievement_definitions → user_achievements", async () => {
      const rows = await all(
        neighbour.from("achievement_definitions").select("key, user_achievements(user_id)"),
        "achievements with unlocks",
      );
      const embedded = rows.flatMap((row) => row.user_achievements);
      for (const unlock of embedded) expect(unlock.user_id).toBe(neighbourId);

      const own = await countOf(neighbourAny, "user_achievements", "user_id", neighbourId);
      expect(embedded).toHaveLength(own);
      // Not vacuous: the owner has unlocks, and none of them appeared.
      expect(await countOf(ownerAny, "user_achievements", "user_id", ownerId)).toBeGreaterThan(0);
    });

    it("quest_definitions → quest_assignments", async () => {
      const rows = await all(
        neighbour.from("quest_definitions").select("key, quest_assignments(user_id)"),
        "quests with assignments",
      );
      const embedded = rows.flatMap((row) => row.quest_assignments);
      for (const assignment of embedded) expect(assignment.user_id).toBe(neighbourId);

      expect(embedded).toHaveLength(
        await countOf(neighbourAny, "quest_assignments", "user_id", neighbourId),
      );
      expect(await countOf(ownerAny, "quest_assignments", "user_id", ownerId)).toBeGreaterThan(0);
    });

    it("cosmetic_definitions → user_cosmetics", async () => {
      const rows = await all(
        neighbour.from("cosmetic_definitions").select("key, user_cosmetics(user_id)"),
        "cosmetics with owners",
      );
      const embedded = rows.flatMap((row) => row.user_cosmetics);
      for (const owned of embedded) expect(owned.user_id).toBe(neighbourId);

      expect(embedded).toHaveLength(
        await countOf(neighbourAny, "user_cosmetics", "user_id", neighbourId),
      );
      expect(await countOf(ownerAny, "user_cosmetics", "user_id", ownerId)).toBeGreaterThan(0);
    });

    it("tasks → profiles resolves only to the caller's own profile", async () => {
      const rows = await all(
        neighbour.from("tasks").select("id, profiles(id)"),
        "tasks with profile",
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.profiles?.id).toBe(neighbourId);
    });

    it("profiles → tasks / calendar_blocks / habits embed only the caller's rows", async () => {
      const rows = await all(
        neighbour
          .from("profiles")
          .select("id, tasks(user_id), calendar_blocks(user_id), habits(user_id)"),
        "profile with children",
      );
      expect(rows).toHaveLength(1);
      const profile = first(rows, "profile");
      expect(profile.id).toBe(neighbourId);
      for (const child of [...profile.tasks, ...profile.calendar_blocks, ...profile.habits]) {
        expect(child.user_id).toBe(neighbourId);
      }
      expect(profile.tasks).toHaveLength(
        await countOf(neighbourAny, "tasks", "user_id", neighbourId),
      );
    });

    it("calendar_blocks → tasks / habits embed nothing of the owner's", async () => {
      const rows = await all(
        neighbour.from("calendar_blocks").select("id, tasks(user_id), habits(user_id)"),
        "blocks with parents",
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        if (row.tasks) expect(row.tasks.user_id).toBe(neighbourId);
        if (row.habits) expect(row.habits.user_id).toBe(neighbourId);
      }
    });
  });

  /* ---------------------------------------------------------------------- */
  /* G. Side channels                                                         */
  /* ---------------------------------------------------------------------- */

  describe("G. no side channel says whether the owner's rows exist", () => {
    it.each(USER_OWNED_TABLES)("%s: an exact count of the owner's rows is 0", async (table) => {
      // `head: true` fetches no rows; only the count header could leak.
      expect(await countOf(neighbourAny, table, ownerColumn(table), ownerId)).toBe(0);
    });

    it("selecting the owner's task by id returns an empty set, not an error", async () => {
      const { data, error } = await neighbour.from("tasks").select("id").eq("id", theirs.openTask);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("selecting the owner's task by id with .single() is indistinguishable from a missing row", async () => {
      const real = await neighbour.from("tasks").select("id").eq("id", theirs.openTask).single();
      const absent = await neighbour
        .from("tasks")
        .select("id")
        .eq("id", crypto.randomUUID())
        .single();
      expect(real.error?.code).toBe("PGRST116");
      expect(absent.error?.code).toBe("PGRST116");
      expect(real.error?.message).toBe(absent.error?.message);
    });

    it("updating or deleting the owner's task by id touches no row and the task survives", async () => {
      const before = await rowAsOwner(ownerAny, "tasks", theirs.openTask);

      const updated = await neighbour
        .from("tasks")
        .update({ title: "RLS proof: renamed" })
        .eq("id", theirs.openTask)
        .select("id");
      expect(updated.error).toBeNull();
      expect(updated.data).toEqual([]);

      const deleted = await neighbour.from("tasks").delete().eq("id", theirs.openTask).select("id");
      expect(deleted.error).toBeNull();
      expect(deleted.data).toEqual([]);

      expect(await rowAsOwner(ownerAny, "tasks", theirs.openTask)).toEqual(before);
    });

    it("assert_same_owner answers identically for the owner's row and for a row that does not exist", async () => {
      // If the two messages differed, a rejected insert would be an existence
      // oracle over every table it guards.
      const taken = expectRefused(
        await neighbour.from("calendar_blocks").insert({
          id: mint("calendar_blocks"),
          user_id: neighbourId,
          kind: "work",
          task_id: theirs.openTask,
          ...SPAN,
        }),
      );
      const missing = expectRefused(
        await neighbour.from("calendar_blocks").insert({
          id: mint("calendar_blocks"),
          user_id: neighbourId,
          kind: "work",
          task_id: crypto.randomUUID(),
          ...SPAN,
        }),
      );
      expect(taken.message).toBe(missing.message);
      expect(taken.details).toBe(missing.details);
      expect(taken.hint).toBe(missing.hint);

      const takenProject = expectRefused(
        await neighbour.from("tasks").insert({
          id: mint("tasks"),
          user_id: neighbourId,
          project_id: theirs.project,
          title: "p",
        }),
      );
      const missingProject = expectRefused(
        await neighbour.from("tasks").insert({
          id: mint("tasks"),
          user_id: neighbourId,
          project_id: crypto.randomUUID(),
          title: "p",
        }),
      );
      expect(takenProject.message).toBe(missingProject.message);
    });

    it("the trusted functions answer 'another account' for the owner's id and 'does not exist' for a random one — and neither leaks content", async () => {
      // This asymmetry is deliberate (docs/DATABASE.md: 42501 maps to 403 so the
      // UI can say "forbidden"). It confirms a row exists, and nothing more;
      // recorded here so a future change to hide even that is a conscious one.
      const taken = expectRefused(
        await neighbour.rpc("complete_task", { p_task_id: theirs.openTask }),
      );
      const missing = expectRefused(
        await neighbour.rpc("complete_task", { p_task_id: crypto.randomUUID() }),
        "P0002",
      );
      expect(taken.message).not.toContain("RLS proof");
      expect(missing.message).toMatch(/does not exist/);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* H. Guarded columns on insert, and the read-only tables as their owner    */
  /* ---------------------------------------------------------------------- */

  describe("H. a row cannot be born in a guarded state, even by its owner", () => {
    it("tasks: status 'completed' (with completed_at) → 42501", async () => {
      const id = mint("tasks");
      const error = expectRefused(
        await owner.from("tasks").insert({
          id,
          user_id: ownerId,
          title: "RLS proof: born done",
          status: "completed",
          completed_at: SPAN.start_at,
        }),
      );
      expect(error.message).toMatch(/status is written only by trusted database logic/);
      expect(await rowAsOwner(ownerAny, "tasks", id)).toBeNull();
    });

    it("tasks: completed_at on an open task → 42501", async () => {
      const id = mint("tasks");
      expectRefused(
        await owner
          .from("tasks")
          .insert({ id, user_id: ownerId, title: "RLS proof", completed_at: SPAN.start_at }),
      );
      expect(await rowAsOwner(ownerAny, "tasks", id)).toBeNull();
    });

    it("tasks: actual_minutes 5 → 42501", async () => {
      const id = mint("tasks");
      const error = expectRefused(
        await owner
          .from("tasks")
          .insert({ id, user_id: ownerId, title: "RLS proof", actual_minutes: 5 }),
      );
      expect(error.message).toMatch(/actual_minutes/);
      expect(await rowAsOwner(ownerAny, "tasks", id)).toBeNull();
    });

    it("calendar_blocks: completed_at → 42501", async () => {
      const id = mint("calendar_blocks");
      expectRefused(
        await owner.from("calendar_blocks").insert({
          id,
          user_id: ownerId,
          kind: "event",
          title: "RLS proof: born done",
          completed_at: SPAN.end_at,
          ...SPAN,
        }),
      );
      expect(await rowAsOwner(ownerAny, "calendar_blocks", id)).toBeNull();
    });

    it("weekly_goals: completed_at → 42501", async () => {
      const id = mint("weekly_goals");
      expectRefused(
        await owner.from("weekly_goals").insert({
          id,
          user_id: ownerId,
          week_start: "2031-03-10",
          metric: "blocks_completed",
          target: 1,
          completed_at: SPAN.end_at,
        }),
      );
      expect(await rowAsOwner(ownerAny, "weekly_goals", id)).toBeNull();
    });
  });

  describe("H. the client-read-only tables refuse a complete, well-formed row from their owner", () => {
    // Full valid shapes with the owner's own user_id, so the refusal can only
    // be the missing grant (42501 "permission denied for table").

    it("xp_events → 42501; the profile total is unchanged", async () => {
      const xp = await profileOf(owner, ownerId);
      const sourceId = crypto.randomUUID();
      probeSourceIds.push(sourceId);

      const error = expectRefused(
        await owner.from("xp_events").insert({
          user_id: ownerId,
          source_type: "task",
          source_id: sourceId,
          amount: 1,
          reason: "RLS proof",
        }),
      );
      expect(error.message).toMatch(/permission denied for table xp_events/);
      expect(await profileOf(owner, ownerId)).toEqual(xp);
    });

    it("habit_completions → 42501", async () => {
      const error = expectRefused(
        await owner.from("habit_completions").insert({
          habit_id: ownerFixture.habits,
          user_id: ownerId,
          completion_date: FAR_WEEK_MONDAY,
          amount: 1,
        }),
      );
      expect(error.message).toMatch(/permission denied for table habit_completions/);
      expect(await countOf(ownerAny, "habit_completions", "habit_id", ownerFixture.habits)).toBe(0);
    });

    it("focus_sessions → 42501", async () => {
      const id = mint("focus_sessions");
      const error = expectRefused(
        await owner.from("focus_sessions").insert({ id, user_id: ownerId, planned_minutes: 25 }),
      );
      expect(error.message).toMatch(/permission denied for table focus_sessions/);
      expect(await rowAsOwner(ownerAny, "focus_sessions", id)).toBeNull();
    });

    it("focus_pauses → 42501", async () => {
      const before = await countOf(ownerAny, "focus_pauses", "session_id", theirs.focusSession);
      const error = expectRefused(
        await owner
          .from("focus_pauses")
          .insert({ session_id: theirs.focusSession, user_id: ownerId, paused_at: SPAN.start_at }),
      );
      expect(error.message).toMatch(/permission denied for table focus_pauses/);
      expect(await countOf(ownerAny, "focus_pauses", "session_id", theirs.focusSession)).toBe(
        before,
      );
    });

    it("user_achievements → 42501", async () => {
      const before = await countOf(ownerAny, "user_achievements", "user_id", ownerId);
      const error = expectRefused(
        await owner
          .from("user_achievements")
          .insert({ user_id: ownerId, achievement_id: theirs.achievementDefinition }),
      );
      expect(error.message).toMatch(/permission denied for table user_achievements/);
      expect(await countOf(ownerAny, "user_achievements", "user_id", ownerId)).toBe(before);
    });

    it("quest_assignments → 42501", async () => {
      const before = await countOf(ownerAny, "quest_assignments", "user_id", ownerId);
      const error = expectRefused(
        await owner.from("quest_assignments").insert({
          user_id: ownerId,
          quest_id: theirs.questDefinition,
          period: "daily",
          period_start: FAR_WEEK_MONDAY,
          slot: 0,
        }),
      );
      expect(error.message).toMatch(/permission denied for table quest_assignments/);
      expect(await countOf(ownerAny, "quest_assignments", "user_id", ownerId)).toBe(before);
    });

    it("user_cosmetics: swapping cosmetic_id for one not paid for → 42501", async () => {
      const before = await all(
        owner
          .from("user_cosmetics")
          .select("cosmetic_id, equipped, purchased_at")
          .eq("user_id", ownerId),
        "owner cosmetics",
      );

      const swap = expectRefused(
        await owner
          .from("user_cosmetics")
          .update({ cosmetic_id: theirs.otherCosmetic })
          .eq("user_id", ownerId)
          .eq("cosmetic_id", theirs.cosmetic),
      );
      expect(swap.message).toMatch(/ownership is written only by trusted database logic/);

      expectRefused(
        await owner
          .from("user_cosmetics")
          .update({ purchased_at: SPAN.start_at })
          .eq("user_id", ownerId)
          .eq("cosmetic_id", theirs.cosmetic),
      );

      const after = await all(
        owner
          .from("user_cosmetics")
          .select("cosmetic_id, equipped, purchased_at")
          .eq("user_id", ownerId),
        "owner cosmetics",
      );
      expect(after).toEqual(before);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* I. Signed out                                                            */
  /* ---------------------------------------------------------------------- */

  describe("I. every granted function refuses a signed-out caller", () => {
    const GRANTED = [
      { fn: "complete_task", args: () => ({ p_task_id: theirs.openTask }) },
      { fn: "uncomplete_task", args: () => ({ p_task_id: theirs.completedTask }) },
      {
        fn: "complete_block",
        args: () => ({ p_block_id: theirs.workBlockOpen, p_also_complete_task: false }),
      },
      {
        fn: "uncomplete_block",
        args: () => ({ p_block_id: theirs.workBlockDone, p_also_uncomplete_task: false }),
      },
      { fn: "complete_habit_block", args: () => ({ p_block_id: theirs.habitBlock }) },
      { fn: "uncomplete_habit_block", args: () => ({ p_block_id: theirs.habitBlock }) },
      {
        fn: "record_habit_completion",
        args: () => ({ p_habit_id: theirs.habit, p_on_date: FAR_WEEK_MONDAY, p_amount: 1 }),
      },
      {
        fn: "remove_habit_completion",
        args: () => ({
          p_habit_id: theirs.habitWithCompletion.habitId,
          p_on_date: theirs.habitWithCompletion.date,
        }),
      },
      {
        fn: "start_focus_session",
        args: () => ({
          p_planned_minutes: 25,
          p_id: mint("focus_sessions"),
          p_task_id: theirs.openTask,
        }),
      },
      { fn: "pause_focus_session", args: () => ({ p_id: theirs.focusSession }) },
      { fn: "resume_focus_session", args: () => ({ p_id: theirs.focusSession }) },
      { fn: "mark_interruption", args: () => ({ p_id: theirs.focusSession }) },
      { fn: "finish_focus_session", args: () => ({ p_id: theirs.focusSession }) },
      { fn: "abandon_focus_session", args: () => ({ p_id: theirs.focusSession }) },
      { fn: "ensure_quest_assignments", args: () => ({}) },
      { fn: "quest_progress", args: () => ({ p_assignment_id: theirs.questAssignment }) },
      { fn: "claim_quest", args: () => ({ p_assignment_id: theirs.questAssignment }) },
      { fn: "weekly_goal_progress", args: () => ({ p_goal_id: theirs.weeklyGoal }) },
      { fn: "claim_weekly_goal", args: () => ({ p_goal_id: theirs.weeklyGoal }) },
      { fn: "purchase_cosmetic", args: () => ({ p_cosmetic_id: theirs.otherCosmetic }) },
    ] as const;

    it.each(GRANTED)("$fn → 42501 with no session", async ({ fn, args }) => {
      const outcome = await signedOutGenericClient().rpc(fn, args());
      const error = expectRefused(outcome);
      expect(error.message).toMatch(/permission denied for function/);
      expect(outcome.data).toBeNull();
    });

    it("the owner's rows are exactly as they were", async () => {
      // The anonymous sweep above named every kind of row; none of them moved.
      const task = await rowAsOwner(ownerAny, "tasks", theirs.openTask);
      expect(task?.status).toBe("open");
      const done = await rowAsOwner(ownerAny, "tasks", theirs.completedTask);
      expect(done?.status).toBe("completed");
      const block = await rowAsOwner(ownerAny, "calendar_blocks", theirs.workBlockDone);
      expect(block?.completed_at).not.toBeNull();
      const goal = await rowAsOwner(ownerAny, "weekly_goals", theirs.weeklyGoal);
      expect(goal?.completed_at).toBeNull();
      const quest = await rowAsOwner(ownerAny, "quest_assignments", theirs.questAssignment);
      expect(quest?.completed_at).toBeNull();
    });
  });
});
