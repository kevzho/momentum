import { beforeAll, describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DB_TESTS_ENABLED,
  SEED_USERS,
  signIn,
  signInGeneric,
  signedOutGenericClient,
  userIdOf,
  type TestClient,
} from "./support/harness";

/**
 * Proof, not assertion.
 *
 * Every user-owned table is walked twice: once as its owner, to establish that
 * there is something there to steal, and once as a second signed-in account,
 * which must come away with nothing and must not be able to write anything.
 * A missing policy is a security bug even if no UI reaches the table
 * (Domain Rule 9), so the list below is the whole schema, not the tables the
 * product happens to render today.
 *
 * Run with: `MOMENTUM_DB_TESTS=1 pnpm test` against a freshly reset local stack.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

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

/** `profiles` is keyed by the user id itself; everywhere else it is `user_id`. */
function ownerColumn(table: UserOwnedTable): "id" | "user_id" {
  return table === "profiles" ? "id" : "user_id";
}

/** Tables a client may only read. Their writes go through trusted functions. */
const READ_ONLY_TABLES = [
  "habit_completions",
  "focus_sessions",
  "focus_pauses",
  "xp_events",
  "user_achievements",
  "quest_assignments",
] as const;

/** Reference data: readable by anyone signed in, writable by migrations only. */
const DEFINITION_TABLES = [
  "achievement_definitions",
  "quest_definitions",
  "cosmetic_definitions",
] as const;

describeDb("row-level security", () => {
  let owner: TestClient;
  let neighbour: TestClient;
  // Untyped twins for the table sweeps, which address tables by variable.
  let ownerAny: SupabaseClient;
  let neighbourAny: SupabaseClient;
  let ownerId: string;
  let neighbourId: string;

  beforeAll(async () => {
    owner = await signIn(SEED_USERS.owner);
    neighbour = await signIn(SEED_USERS.neighbour);
    ownerAny = await signInGeneric(SEED_USERS.owner);
    neighbourAny = await signInGeneric(SEED_USERS.neighbour);
    ownerId = await userIdOf(owner);
    neighbourId = await userIdOf(neighbour);
    expect(ownerId).not.toBe(neighbourId);
  });

  describe("the seed gives both accounts something worth protecting", () => {
    it.each(USER_OWNED_TABLES)("%s has rows for the owner", async (table) => {
      const { data, error } = await ownerAny.from(table).select(ownerColumn(table));
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBeGreaterThan(0);
    });

    // Both halves matter. Without rows of their own, "an unscoped select
    // returns only the neighbour's own rows" below passes on an empty set and
    // proves nothing about that table.
    it.each(USER_OWNED_TABLES)("%s has rows for the neighbour too", async (table) => {
      const { data, error } = await neighbourAny.from(table).select(ownerColumn(table));
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBeGreaterThan(0);
    });
  });

  describe("a second account cannot read the first's rows", () => {
    it.each(USER_OWNED_TABLES)("%s returns nothing belonging to the owner", async (table) => {
      const column = ownerColumn(table);
      const { data, error } = await neighbourAny.from(table).select(column).eq(column, ownerId);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it.each(USER_OWNED_TABLES)("%s returns only the neighbour's own rows", async (table) => {
      const column = ownerColumn(table);
      const { data, error } = await neighbourAny.from(table).select(column);

      expect(error).toBeNull();
      // Whatever comes back is theirs. An unscoped select must never leak.
      for (const row of (data ?? []) as Record<string, string>[]) {
        expect(row[column]).toBe(neighbourId);
      }
    });
  });

  describe("a second account cannot write the first's rows", () => {
    it.each(USER_OWNED_TABLES)("%s: an update touches no row", async (table) => {
      const column = ownerColumn(table);
      // A no-op change: if the policy let it through, the row would come back.
      const { data, error } = await neighbourAny
        .from(table)
        .update({ [column]: ownerId })
        .eq(column, ownerId)
        .select(column);

      // Either the policy hides every candidate row (no rows updated) or the
      // grant refuses the verb outright. Both are a denial.
      if (error === null) expect(data).toEqual([]);
      else expect(error.code).toBeTruthy();
    });

    it.each(USER_OWNED_TABLES)("%s: a delete removes no row", async (table) => {
      const column = ownerColumn(table);
      const { data, error } = await neighbourAny
        .from(table)
        .delete()
        .eq(column, ownerId)
        .select(column);

      if (error === null) expect(data).toEqual([]);
      else expect(error.code).toBeTruthy();
    });

    it("cannot insert a project owned by someone else", async () => {
      const { error } = await neighbour
        .from("projects")
        .insert({ user_id: ownerId, name: "Not mine" });

      expect(error).not.toBeNull();
    });

    it("cannot insert a task owned by someone else", async () => {
      const { error } = await neighbour
        .from("tasks")
        .insert({ user_id: ownerId, title: "Not mine" });

      expect(error).not.toBeNull();
    });

    it("the owner's rows are still all there afterwards", async () => {
      const { count, error } = await owner
        .from("tasks")
        .select("id", { count: "exact", head: true });

      expect(error).toBeNull();
      expect(count ?? 0).toBeGreaterThan(30);
    });
  });

  describe("client-read-only tables reject writes even from their owner", () => {
    it.each(READ_ONLY_TABLES)("%s refuses an insert", async (table) => {
      // The row shape does not matter: the grant and the missing policy stop
      // the statement before any column is considered.
      const { error } = await ownerAny.from(table).insert({ user_id: ownerId });
      expect(error).not.toBeNull();
    });

    it.each(READ_ONLY_TABLES)("%s refuses a delete", async (table) => {
      const { data, error } = await ownerAny
        .from(table)
        .delete()
        .eq("user_id", ownerId)
        .select("*");
      if (error === null) expect(data).toEqual([]);
      else expect(error.code).toBeTruthy();
    });

    it("xp_events is append-only: the owner cannot rewrite an award", async () => {
      const { data: events } = await owner.from("xp_events").select("id").limit(1);
      const id = events?.[0]?.id;
      expect(id).toBeTruthy();

      const { data, error } = await owner
        .from("xp_events")
        .update({ amount: 9999 })
        .eq("id", id!)
        .select("id");

      if (error === null) expect(data).toEqual([]);
      else expect(error.code).toBeTruthy();
    });
  });

  describe("guarded columns are not client-writable", () => {
    it("refuses to change the profile's XP", async () => {
      const { error } = await owner.from("profiles").update({ xp: 999_999 }).eq("id", ownerId);
      expect(error?.code).toBe("42501");
    });

    it("refuses to change the profile's level or coins", async () => {
      const level = await owner.from("profiles").update({ level: 99 }).eq("id", ownerId);
      expect(level.error?.code).toBe("42501");

      const coins = await owner.from("profiles").update({ coins: 99 }).eq("id", ownerId);
      expect(coins.error?.code).toBe("42501");
    });

    it("allows the settings a user does own", async () => {
      const { error } = await owner
        .from("profiles")
        .update({ week_start: 1, snap_minutes: 15 })
        .eq("id", ownerId);

      expect(error).toBeNull();
    });

    it("refuses to complete a task by writing the columns directly", async () => {
      const { data: tasks } = await owner.from("tasks").select("id").eq("status", "open").limit(1);
      const id = tasks?.[0]?.id;
      expect(id).toBeTruthy();

      const status = await owner.from("tasks").update({ status: "completed" }).eq("id", id!);
      expect(status.error?.code).toBe("42501");

      const actual = await owner.from("tasks").update({ actual_minutes: 600 }).eq("id", id!);
      expect(actual.error?.code).toBe("42501");
    });

    it("still allows archiving, which is an ordinary edit", async () => {
      const { data: tasks } = await owner.from("tasks").select("id").eq("status", "open").limit(1);
      const id = tasks![0]!.id;

      const archived = await owner
        .from("tasks")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", id);
      expect(archived.error).toBeNull();

      const restored = await owner
        .from("tasks")
        .update({ status: "open", archived_at: null })
        .eq("id", id);
      expect(restored.error).toBeNull();
    });

    it("refuses to mark a calendar block complete directly", async () => {
      const { data: blocks } = await owner.from("calendar_blocks").select("id").limit(1);
      const id = blocks?.[0]?.id;
      expect(id).toBeTruthy();

      const { error } = await owner
        .from("calendar_blocks")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", id!);

      expect(error?.code).toBe("42501");
    });
  });

  describe("foreign keys cannot cross an account boundary", () => {
    it("refuses a work block pointing at another user's task", async () => {
      const { data: tasks } = await owner.from("tasks").select("id").limit(1);
      const foreignTaskId = tasks![0]!.id;

      const start = new Date();
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      const { error } = await neighbour.from("calendar_blocks").insert({
        user_id: neighbourId,
        kind: "work",
        task_id: foreignTaskId,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
      });

      // The row would pass the policy — it is the neighbour's own user_id —
      // and is stopped by assert_same_owner().
      expect(error).not.toBeNull();
    });

    it("refuses a task filed under another user's project", async () => {
      const { data: projects } = await owner.from("projects").select("id").limit(1);
      const foreignProjectId = projects![0]!.id;

      const { error } = await neighbour
        .from("tasks")
        .insert({ user_id: neighbourId, title: "Borrowed project", project_id: foreignProjectId });

      expect(error).not.toBeNull();
    });
  });

  describe("signed out", () => {
    it.each(USER_OWNED_TABLES)("%s is unreachable", async (table) => {
      const anon = signedOutGenericClient();
      const { data, error } = await anon.from(table).select(ownerColumn(table));

      if (error === null) expect(data).toEqual([]);
      else expect(error.code).toBeTruthy();
    });

    it.each(DEFINITION_TABLES)("%s is unreachable", async (table) => {
      const anon = signedOutGenericClient();
      const { data, error } = await anon.from(table).select("key");

      if (error === null) expect(data).toEqual([]);
      else expect(error.code).toBeTruthy();
    });
  });

  describe("reference data", () => {
    it.each(DEFINITION_TABLES)("%s is readable by any signed-in user", async (table) => {
      const { data, error } = await neighbour.from(table).select("key");

      expect(error).toBeNull();
      expect(data?.length ?? 0).toBeGreaterThan(0);
    });

    it.each(DEFINITION_TABLES)("%s is not writable", async (table) => {
      const { error } = await ownerAny.from(table).insert({ key: "injected" });
      expect(error).not.toBeNull();
    });
  });
});
