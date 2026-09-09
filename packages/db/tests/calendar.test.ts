import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ianaTimeZone,
  instant,
  localDate,
  nowInstant,
  todayIn,
  weekOf,
  weekRange,
} from "@momentum/core/time";

import * as blocks from "../src/repositories/blocks";
import * as tasks from "../src/repositories/tasks";
import { DB_TESTS_ENABLED, SEED_USERS, signIn, userIdOf, type TestClient } from "./support/harness";

/**
 * The calendar's trusted writes, proved against a real database.
 *
 * The thing under test is a set of `security definer` functions and the guard
 * triggers they exist to outrank, so mocking the client would prove nothing
 * (docs/ARCHITECTURE.md §13). The suite skips itself cleanly without
 * `MOMENTUM_DB_TESTS=1`, so `pnpm test` stays green with no Docker.
 *
 * Run with: `MOMENTUM_DB_TESTS=1 pnpm test` against a freshly reset stack.
 *
 * Fixtures are created and torn down per test rather than borrowed from the
 * seed: these tests complete tasks and blocks, and the seed is shared with the
 * RLS suite, which counts rows.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

/** Far enough out that nothing the seed positions relative to `now()` can overlap it. */
const SPANS = [
  { start: "2030-03-04T15:00:00.000Z", end: "2030-03-04T16:00:00.000Z" },
  { start: "2030-03-05T15:00:00.000Z", end: "2030-03-05T16:00:00.000Z" },
  { start: "2030-03-06T15:00:00.000Z", end: "2030-03-06T16:00:00.000Z" },
] as const;

describeDb("calendar completion", () => {
  let owner: TestClient;
  let neighbour: TestClient;
  let ownerId: string;
  let neighbourId: string;

  /** The fixture task and the three work blocks pointing at it. */
  let taskId: string;
  let blockIds: string[];

  beforeAll(async () => {
    owner = await signIn(SEED_USERS.owner);
    neighbour = await signIn(SEED_USERS.neighbour);
    ownerId = await userIdOf(owner);
    neighbourId = await userIdOf(neighbour);
    expect(ownerId).not.toBe(neighbourId);
  });

  beforeEach(async () => {
    const { data: task, error: taskError } = await owner
      .from("tasks")
      .insert({ user_id: ownerId, title: "Fixture: three-block task", estimated_minutes: 180 })
      .select("id")
      .single();
    if (taskError) throw taskError;
    taskId = task.id;

    const { data: rows, error: blockError } = await owner
      .from("calendar_blocks")
      .insert(
        SPANS.map((span) => ({
          user_id: ownerId,
          kind: "work" as const,
          task_id: taskId,
          start_at: span.start,
          end_at: span.end,
        })),
      )
      .select("id, start_at")
      .order("start_at", { ascending: true });
    if (blockError) throw blockError;
    blockIds = rows.map((row) => row.id);
    expect(blockIds).toHaveLength(3);
  });

  afterEach(async () => {
    // Blocks have no meaning without their parent and cascade with it
    // (Domain Rule 13), so deleting the task is the whole teardown.
    await owner.from("tasks").delete().eq("id", taskId);
  });

  function firstBlock(): string {
    const id = blockIds[0];
    if (id === undefined) throw new Error("fixture blocks were not created");
    return id;
  }

  function secondBlock(): string {
    const id = blockIds[1];
    if (id === undefined) throw new Error("fixture blocks were not created");
    return id;
  }

  async function readBlock(id: string) {
    const { data, error } = await owner
      .from("calendar_blocks")
      .select("id, completed_at")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  async function readTask() {
    const { data, error } = await owner
      .from("tasks")
      .select("id, status, completed_at")
      .eq("id", taskId)
      .single();
    if (error) throw error;
    return data;
  }

  describe("the guard", () => {
    it("refuses a direct write to completed_at, even from the row's owner", async () => {
      const { error } = await owner
        .from("calendar_blocks")
        .update({ completed_at: "2030-03-04T16:00:00.000Z" })
        .eq("id", firstBlock())
        .select("id");

      // Domain Rule 15: the browser holds the user's own JWT, so a column a
      // policy lets them write is client-writable. This is why the column is
      // guarded rather than merely "not written by the app".
      expect(error?.code).toBe("42501");
      expect((await readBlock(firstBlock())).completed_at).toBeNull();
    });

    it("refuses a direct write to a task's status and completed_at", async () => {
      const { error } = await owner
        .from("tasks")
        .update({ status: "completed", completed_at: "2030-03-04T16:00:00.000Z" })
        .eq("id", taskId)
        .select("id");

      expect(error?.code).toBe("42501");
      expect((await readTask()).status).toBe("open");
    });
  });

  describe("complete_block", () => {
    it("sets completed_at with the database's clock", async () => {
      const before = nowInstant();
      const block = await blocks.complete(owner, firstBlock());
      const after = nowInstant();
      const completedAt = block.completedAt;

      expect(completedAt).not.toBeNull();
      // Instants are canonical fixed-width UTC strings, so `<` is chronological.
      expect(completedAt !== null && completedAt >= before).toBe(true);
      expect(completedAt !== null && completedAt <= after).toBe(true);
    });

    it("is a no-op the second time, and does not restamp", async () => {
      const first = await blocks.complete(owner, firstBlock());
      const second = await blocks.complete(owner, firstBlock());

      // A retried optimistic mutation is not an error (Domain Rule 17), and a
      // retry must not move a completion time the user already earned.
      expect(second.completedAt).toBe(first.completedAt);
    });

    it("leaves the task open when the caller does not ask for it", async () => {
      await blocks.complete(owner, firstBlock(), false);

      const task = await readTask();
      expect(task.status).toBe("open");
      expect(task.completed_at).toBeNull();
    });

    it("completes the task too when the caller asks for it", async () => {
      const block = await blocks.complete(owner, firstBlock(), true);

      expect(block.completedAt).not.toBeNull();
      const task = await readTask();
      expect(task.status).toBe("completed");
      expect(task.completed_at).not.toBeNull();
    });

    it("finishes the job on a retry whose first attempt lost its response", async () => {
      // The block is already complete but the task is not — exactly the state a
      // dropped response leaves behind. Converging on the requested state is
      // what makes the retry safe.
      await blocks.complete(owner, firstBlock(), false);
      await blocks.complete(owner, firstBlock(), true);

      expect((await readTask()).status).toBe("completed");
    });

    it("refuses to complete a task from a block that has none", async () => {
      const { data: event, error: insertError } = await owner
        .from("calendar_blocks")
        .insert({
          user_id: ownerId,
          kind: "event",
          title: "Fixture: standalone event",
          start_at: "2030-03-07T15:00:00.000Z",
          end_at: "2030-03-07T16:00:00.000Z",
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const { error } = await owner.rpc("complete_block", {
        p_block_id: event.id,
        p_also_complete_task: true,
      });

      expect(error?.code).toBe("22023");
      await owner.from("calendar_blocks").delete().eq("id", event.id);
    });

    it("reports a block that does not exist as not found", async () => {
      const { error } = await owner.rpc("complete_block", {
        p_block_id: "00000000-0000-4000-8000-000000000000",
      });

      expect(error?.code).toBe("P0002");
    });
  });

  describe("uncomplete_block", () => {
    it("clears completed_at", async () => {
      await blocks.complete(owner, firstBlock());
      const block = await blocks.uncomplete(owner, firstBlock());

      expect(block.completedAt).toBeNull();
    });

    it("is a no-op on a block that was never completed", async () => {
      const block = await blocks.uncomplete(owner, firstBlock());
      expect(block.completedAt).toBeNull();
    });

    it("leaves the task completed unless the caller asks otherwise", async () => {
      await blocks.complete(owner, firstBlock(), true);
      await blocks.uncomplete(owner, firstBlock());

      // Un-doing a span says nothing about the work by itself (Domain Rule 13).
      expect((await readTask()).status).toBe("completed");
    });

    it("reopens the task when the caller asks for it", async () => {
      await blocks.complete(owner, firstBlock(), true);
      await blocks.uncomplete(owner, firstBlock(), true);

      // The mirror of complete_block's flag: a completion the user made in one
      // action can be undone in one action.
      const task = await readTask();
      expect(task.status).toBe("open");
      expect(task.completed_at).toBeNull();
    });

    it("finishes reopening on a retry whose first attempt lost its response", async () => {
      await blocks.complete(owner, firstBlock(), true);
      await blocks.uncomplete(owner, firstBlock(), false);
      await blocks.uncomplete(owner, firstBlock(), true);

      expect((await readTask()).status).toBe("open");
    });

    it("refuses to reopen a task from a block that has none", async () => {
      const { data: event, error: insertError } = await owner
        .from("calendar_blocks")
        .insert({
          user_id: ownerId,
          kind: "event",
          title: "Fixture: standalone event",
          start_at: "2030-03-08T15:00:00.000Z",
          end_at: "2030-03-08T16:00:00.000Z",
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const { error } = await owner.rpc("uncomplete_block", {
        p_block_id: event.id,
        p_also_uncomplete_task: true,
      });

      expect(error?.code).toBe("22023");
      await owner.from("calendar_blocks").delete().eq("id", event.id);
    });
  });

  describe("task completion", () => {
    it("leaves every one of the task's blocks untouched", async () => {
      await tasks.complete(owner, taskId);

      // Domain Rule 13: incomplete future blocks of a completed task stay on
      // the calendar. Nothing is deleted and nothing is completed on their
      // behalf.
      const counts = await blocks.blockCountsByTask(owner, [taskId]);
      expect(counts.get(taskId)).toEqual({ total: 3, incomplete: 3 });
    });

    it("restores the task on uncomplete, with its blocks still as they were", async () => {
      await blocks.complete(owner, firstBlock());
      await tasks.complete(owner, taskId);
      const reopened = await tasks.uncomplete(owner, taskId);

      expect(reopened.status).toBe("open");
      expect(reopened.completedAt).toBeNull();
      const counts = await blocks.blockCountsByTask(owner, [taskId]);
      expect(counts.get(taskId)).toEqual({ total: 3, incomplete: 2 });
    });

    it("is idempotent in both directions", async () => {
      const first = await tasks.complete(owner, taskId);
      const second = await tasks.complete(owner, taskId);
      expect(second.completedAt).toBe(first.completedAt);

      await tasks.uncomplete(owner, taskId);
      const twice = await tasks.uncomplete(owner, taskId);
      expect(twice.status).toBe("open");
    });
  });

  /*
   * Domain Rule 15 says the guarded columns are written "only by security
   * definer database functions". Phase 2 wrote the guards as `before update`
   * triggers, which left a hole a client could walk straight through: a row
   * does not have to be *updated* into a completed state, it can be *created*
   * in one. These four ran green against the un-fixed schema, which is why they
   * are here — a guard nobody tried to get past is a guard nobody has tested.
   */
  describe("the guarded columns, on the way in", () => {
    it("refuses a block created already completed", async () => {
      const { error } = await owner
        .from("calendar_blocks")
        .insert({
          user_id: ownerId,
          kind: "event",
          title: "Backdated",
          start_at: "2026-09-08T16:00:00Z",
          end_at: "2026-09-08T17:00:00Z",
          completed_at: "2026-09-08T16:00:00Z",
        })
        .select("id");

      expect(error?.message).toMatch(/completed_at is written only by trusted/);
    });

    it("refuses a task created already completed", async () => {
      const { error } = await owner
        .from("tasks")
        .insert({ user_id: ownerId, title: "Backdated", status: "completed" })
        .select("id");

      expect(error?.message).toMatch(/status is written only by trusted/);
    });

    it("refuses a task created with actual minutes nobody measured", async () => {
      // The one that matters most: `actual_minutes` is what Domain Rule 3 calls
      // the product's long-term signal, Phase 7 writes it only from measured
      // focus sessions, and Phase 10 reads it back as fact.
      const { error } = await owner
        .from("tasks")
        .insert({ user_id: ownerId, title: "Fabricated", actual_minutes: 999 })
        .select("id");

      expect(error?.message).toMatch(/actual_minutes is written only by trusted/);
    });

    it("still allows an ordinary open block and an ordinary open task", async () => {
      const block = await owner
        .from("calendar_blocks")
        .insert({
          user_id: ownerId,
          kind: "event",
          title: "Ordinary",
          start_at: "2026-09-08T16:00:00Z",
          end_at: "2026-09-08T17:00:00Z",
        })
        .select("id")
        .single();
      expect(block.error).toBeNull();
      if (block.data) await owner.from("calendar_blocks").delete().eq("id", block.data.id);

      const task = await owner
        .from("tasks")
        .insert({ user_id: ownerId, title: "Ordinary" })
        .select("id")
        .single();
      expect(task.error).toBeNull();
      if (task.data) await owner.from("tasks").delete().eq("id", task.data.id);
    });

    it("refuses a plain update of completed_at after a trusted call in the same session", async () => {
      /*
       * Not the whole of what the migration fixed, and worth saying why. The
       * trusted flag is transaction-*local*, and PostgREST opens a transaction
       * per request, so a leak between two HTTP calls is not observable from
       * here at all — the reviewer who found it had to hold one psql
       * transaction open across both statements. What this can prove is the
       * part a client could actually reach: a session that has just called a
       * trusted function still cannot write the column itself.
       */
      await blocks.complete(owner, secondBlock());

      const { error } = await owner
        .from("calendar_blocks")
        .update({ completed_at: null })
        .eq("id", secondBlock())
        .select("id");

      expect(error?.message).toMatch(/completed_at is written only by trusted/);

      await blocks.uncomplete(owner, secondBlock());
    });
  });

  /*
   * The same shape of hole one table over. Domain Rule 16 makes an override
   * something only an event has, and Rule 13 says the database is what enforces
   * the per-kind shape — but Phase 2 pinned `kind = 'event'` on the series side
   * of the recurrence checks and left the override side asking only that
   * `series_id` and `occurrence_date` arrive together. A work block could
   * therefore carry a `series_id`, which `listWindow` reads as an override and
   * `rowToEventBlock` throws on, taking the whole week query down with it. The
   * first two ran green against the un-fixed schema.
   */
  describe("the override shape, on the way in", () => {
    /** An event of the owner's for the mis-shaped rows to point at. */
    let seriesId: string;

    beforeEach(async () => {
      const { data, error } = await owner
        .from("calendar_blocks")
        .insert({
          user_id: ownerId,
          kind: "event",
          title: "Fixture: a series to override",
          start_at: "2030-03-07T15:00:00.000Z",
          end_at: "2030-03-07T16:00:00.000Z",
        })
        .select("id")
        .single();
      if (error) throw error;
      seriesId = data.id;
    });

    afterEach(async () => {
      await owner.from("calendar_blocks").delete().eq("id", seriesId);
    });

    it("refuses a work block that claims to be an occurrence of a series", async () => {
      const { error } = await owner
        .from("calendar_blocks")
        .insert({
          user_id: ownerId,
          kind: "work",
          task_id: taskId,
          series_id: seriesId,
          occurrence_date: "2030-03-07",
          start_at: "2030-03-07T17:00:00.000Z",
          end_at: "2030-03-07T18:00:00.000Z",
        })
        .select("id");

      expect(error?.code).toBe("23514");
      expect(error?.message).toContain("blocks_override_shape_chk");
    });

    it("refuses the cancelled shape as well, which was the same hole", async () => {
      // `blocks_cancelled_chk` already required a series, so tightening the
      // override check reaches it too. Left open, a work block stored
      // `cancelled = true` read back as *not* cancelled: the mappers hardcode
      // `cancelled: false` for the kinds that cannot have it.
      const { error } = await owner
        .from("calendar_blocks")
        .insert({
          user_id: ownerId,
          kind: "work",
          task_id: taskId,
          series_id: seriesId,
          occurrence_date: "2030-03-07",
          cancelled: true,
          start_at: "2030-03-07T17:00:00.000Z",
          end_at: "2030-03-07T18:00:00.000Z",
        })
        .select("id");

      expect(error?.code).toBe("23514");
      expect(error?.message).toContain("blocks_override_shape_chk");
    });

    it("still accepts the override the calendar actually writes", async () => {
      const { data, error } = await owner
        .from("calendar_blocks")
        .insert({
          user_id: ownerId,
          kind: "event",
          title: "Moved occurrence",
          series_id: seriesId,
          occurrence_date: "2030-03-07",
          start_at: "2030-03-07T19:00:00.000Z",
          end_at: "2030-03-07T20:00:00.000Z",
        })
        .select("id")
        .single();

      expect(error).toBeNull();
      if (data) await owner.from("calendar_blocks").delete().eq("id", data.id);
    });
  });

  describe("another account", () => {
    it("cannot complete a block it does not own", async () => {
      const { error } = await neighbour.rpc("complete_block", { p_block_id: firstBlock() });

      // `assert_caller` refuses before anything is written. 42501 is what
      // PostgREST turns into a 403 and the action layer maps to `forbidden`.
      expect(error?.code).toBe("42501");
      expect((await readBlock(firstBlock())).completed_at).toBeNull();
    });

    it("cannot un-complete a block it does not own", async () => {
      await blocks.complete(owner, firstBlock());
      const { error } = await neighbour.rpc("uncomplete_block", { p_block_id: firstBlock() });

      expect(error?.code).toBe("42501");
      expect((await readBlock(firstBlock())).completed_at).not.toBeNull();
    });

    it("cannot complete a task it does not own", async () => {
      const { error } = await neighbour.rpc("complete_task", { p_task_id: taskId });

      expect(error?.code).toBe("42501");
      expect((await readTask()).status).toBe("open");
    });
  });

  describe("the repositories the calendar reads through", () => {
    it("splits a window into plain rows, series and overrides", async () => {
      // The seed positions everything relative to `now()` in each profile's own
      // timezone, so the current week is always populated: one weekly series
      // with an `until`, one moved occurrence and one cancelled one.
      const timezone = ianaTimeZone("America/New_York");
      const today = todayIn(timezone, nowInstant());
      const week = weekRange(today, 1, timezone);
      const { start: startDate, days } = weekOf(today, 1);
      const endDate = days[6];
      if (endDate === undefined) throw new Error("a week has seven days");

      const rows = await blocks.listWindow(owner, {
        start: week.start,
        end: week.end,
        startDate,
        endDate,
      });

      expect(rows.blocks.length).toBeGreaterThan(0);
      expect(rows.series.length).toBeGreaterThan(0);
      expect(rows.overrides.length).toBeGreaterThan(0);

      // The three predicates are disjoint: no row is counted as two things.
      for (const block of rows.blocks) {
        expect(block.kind === "event" ? block.recurrence : null).toBeNull();
        expect(block.kind === "event" ? block.seriesId : null).toBeNull();
      }
      for (const series of rows.series) expect(series.recurrence).not.toBeNull();
      for (const override of rows.overrides) expect(override.seriesId).not.toBeNull();
    });

    it("counts a task's work blocks across every week, not the displayed one", async () => {
      await blocks.complete(owner, firstBlock());

      const counts = await blocks.blockCountsByTask(owner, [taskId]);
      expect(counts.get(taskId)).toEqual({ total: 3, incomplete: 2 });
    });

    it("returns nothing for a task list that is empty, without a round trip", async () => {
      expect(await blocks.blockCountsByTask(owner, [])).toEqual(new Map());
      expect(await tasks.scheduledMinutesByTask(owner, [])).toEqual(new Map());
      expect(await tasks.listByIds(owner, [])).toEqual([]);
    });

    it("sums the minutes a task already has reserved", async () => {
      const minutes = await tasks.scheduledMinutesByTask(owner, [taskId]);
      expect(minutes.get(taskId)).toBe(180);
    });

    it("drops a task out of UNSCHEDULED as soon as it owns a work block", async () => {
      const scheduled = await tasks.listUnscheduledFor(owner, ownerId);
      expect(scheduled.map((task) => task.id)).not.toContain(taskId);

      // The same task with its blocks removed is unscheduled again — which is
      // the set difference the repository does in memory, because PostgREST
      // cannot express `not exists (select …)`.
      await owner.from("calendar_blocks").delete().eq("task_id", taskId);
      const unscheduled = await tasks.listUnscheduledFor(owner, ownerId);
      expect(unscheduled.map((task) => task.id)).toContain(taskId);
    });

    it("sees none of another account's blocks through row-level security", async () => {
      const rows = await blocks.listWindow(neighbour, {
        start: instant("2030-03-04T00:00:00.000Z"),
        end: instant("2030-03-08T00:00:00.000Z"),
        startDate: localDate("2030-03-04"),
        endDate: localDate("2030-03-07"),
      });

      expect(rows.blocks).toEqual([]);
      expect(rows.overrides).toEqual([]);
    });
  });
});
