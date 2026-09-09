import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as focus from "../src/repositories/focus";
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
 * The focus lifecycle, proved against a real database.
 *
 * Everything here is a claim about Postgres rather than about TypeScript, and
 * none of it can be made by a unit test (docs/ARCHITECTURE.md §13):
 *
 * 1. **The tables are client-read-only.** A signed-in client holding its own
 *    JWT cannot insert a session, cannot stamp a `started_at`, and cannot write
 *    an `xp_events` row (Domain Rule 15). If that is not true, nothing else in
 *    this phase means anything.
 * 2. **One live session per account** — a constraint, not a UI convention, so
 *    two tabs cannot double-count.
 * 3. **The measured minutes exclude pauses**, computed by the database from its
 *    own clock.
 * 4. **The award is idempotent.** Finishing a finished session again awards
 *    nothing further and moves no minutes (Domain Rules 6, 17).
 * 5. **The caps hold**, and a sub-minimum session earns nothing.
 *
 * The suite skips itself cleanly without `MOMENTUM_DB_TESTS=1`, so `pnpm test`
 * stays green with no Docker. Run with:
 *   `MOMENTUM_DB_TESTS=1 pnpm test` against a freshly reset stack.
 *
 * Several cases need a session that started in the past, and the client is not
 * allowed to say when a session started — which is the point. They use the
 * admin client to move `started_at` backwards *after* the fact, which is a test
 * harness reaching past the product's own front door, not a path the
 * application has.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

describeDb("focus sessions", () => {
  let owner: TestClient;
  let neighbour: TestClient;
  let ownerId: string;
  let admin: TestClient;

  /** A fixture task, recreated per test, so `actual_minutes` starts at 0. */
  let taskId: string;

  beforeAll(async () => {
    owner = await signIn(SEED_USERS.owner);
    neighbour = await signIn(SEED_USERS.neighbour);
    ownerId = await userIdOf(owner);
    admin = adminClient();
  });

  beforeEach(async () => {
    const task = await tasks.insert(owner, {
      userId: ownerId,
      title: "Fixture: focus target",
      priority: 3,
      estimatedMinutes: 120,
    });
    taskId = task.id;
  });

  afterEach(async () => {
    /*
     * Only the sessions *this suite* created.
     *
     * It used to delete every session belonging to the owner, which also took
     * the eight weeks of seeded history with it — and `rls.test.ts` asserts
     * that the seed leaves each account rows worth protecting, because without
     * them "the neighbour sees nothing" passes on an empty set and proves
     * nothing. The two files only ever agreed by accident: they ran in
     * parallel, and the read sometimes won. Tracking the ids the suite mints
     * makes the cleanup say what it means.
     *
     * Sessions point at the task with `on delete set null`, so they outlive it
     * and have to go explicitly, and their ledger rows with them.
     */
    for (const sessionId of minted.splice(0)) {
      await admin.from("xp_events").delete().eq("source_id", sessionId);
      await admin.from("focus_sessions").delete().eq("id", sessionId);
    }
    await tasks.remove(owner, taskId);
  });

  /** Session ids this suite created, so `afterEach` removes those and no others. */
  const minted: string[] = [];

  function id(): string {
    const value = crypto.randomUUID();
    minted.push(value);
    return value;
  }

  /** Moves a session's start backwards, so a measured duration can be asserted. */
  async function startedMinutesAgo(sessionId: string, minutes: number): Promise<void> {
    const { error } = await admin
      .from("focus_sessions")
      .update({ started_at: new Date(Date.now() - minutes * 60_000).toISOString() })
      .eq("id", sessionId);
    if (error) throw error;
  }

  async function pauseRowsOf(
    sessionId: string,
  ): Promise<{ paused_at: string; resumed_at: string | null }[]> {
    const { data, error } = await owner
      .from("focus_pauses")
      .select("paused_at, resumed_at")
      .eq("session_id", sessionId)
      .order("paused_at", { ascending: true });
    if (error) throw error;
    return data;
  }

  async function xpFor(sessionId: string): Promise<number[]> {
    const { data, error } = await owner
      .from("xp_events")
      .select("amount")
      .eq("source_type", "focus_session")
      .eq("source_id", sessionId);
    if (error) throw error;
    return data.map((row) => row.amount);
  }

  /**
   * The owner's focus XP inside the rolling 24-hour cap window. The cap
   * (20260909120100) is measured over `created_at > now() - 24h` rather than a
   * calendar date in the profile timezone, which a client could reset; on a
   * freshly reset database the seed's own recent sessions land in this window, so
   * a test that fills the cap has to account for what is already in it.
   */
  async function focusXpInWindow(): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await owner
      .from("xp_events")
      .select("amount")
      .eq("source_type", "focus_session")
      .gt("created_at", since);
    if (error) throw error;
    return data.reduce((sum, row) => sum + row.amount, 0);
  }

  async function actualMinutesOf(id: string): Promise<number> {
    const task = await tasks.findById(owner, id);
    if (task === null) throw new Error("fixture task vanished");
    return task.actualMinutes;
  }

  /* ---------------------------------------------------------------------- */
  /* The tables are written by nothing but the functions                     */
  /* ---------------------------------------------------------------------- */

  it("refuses a direct insert into focus_sessions", async () => {
    const { error } = await owner.from("focus_sessions").insert({
      id: id(),
      user_id: ownerId,
      planned_minutes: 25,
      started_at: new Date(Date.now() - 3_600_000).toISOString(),
    });

    expect(error).not.toBeNull();
  });

  it("refuses a direct insert into focus_pauses", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });

    const { error } = await owner.from("focus_pauses").insert({
      session_id: session.id,
      user_id: ownerId,
      paused_at: new Date().toISOString(),
    });

    expect(error).not.toBeNull();
  });

  it("refuses a direct insert into the XP ledger", async () => {
    const { error } = await owner.from("xp_events").insert({
      user_id: ownerId,
      source_type: "focus_session",
      source_id: id(),
      amount: 5_000,
      reason: "Minted by the client",
    });

    expect(error).not.toBeNull();
  });

  it("shows the neighbour nothing", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });

    const { data } = await neighbour.from("focus_sessions").select("id").eq("id", session.id);
    expect(data).toEqual([]);

    await expect(focus.finish(neighbour, session.id)).rejects.toMatchObject({ code: "42501" });
  });

  /* ---------------------------------------------------------------------- */
  /* One live session                                                        */
  /* ---------------------------------------------------------------------- */

  it("stamps started_at itself and starts running", async () => {
    const before = Date.now();
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });

    expect(session.status).toBe("running");
    expect(session.actualMinutes).toBeNull();
    expect(Date.parse(session.startedAt)).toBeGreaterThanOrEqual(before - 5_000);
  });

  it("inherits the task's project when none is named", async () => {
    const { data } = await owner.from("projects").select("id").eq("user_id", ownerId).limit(1);
    const projectId = data?.[0]?.id;
    if (!projectId) return;

    await tasks.update(owner, taskId, { projectId });
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });

    expect(session.projectId).toBe(projectId);
  });

  it("refuses a second live session", async () => {
    await focus.start(owner, { id: id(), plannedMinutes: 25, taskId, projectId: null });

    await expect(
      focus.start(owner, { id: id(), plannedMinutes: 50, taskId, projectId: null }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("returns the same session when a start is retried with the same id", async () => {
    const sessionId = id();
    const first = await focus.start(owner, {
      id: sessionId,
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });
    const retry = await focus.start(owner, {
      id: sessionId,
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });

    expect(retry.id).toBe(first.id);
    expect(retry.startedAt).toBe(first.startedAt);
  });

  /* ---------------------------------------------------------------------- */
  /* Pause and resume                                                        */
  /* ---------------------------------------------------------------------- */

  it("records a pause span and closes it on resume", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });

    const paused = await focus.pause(owner, session.id);
    expect(paused.status).toBe("paused");
    expect(await pauseRowsOf(session.id)).toHaveLength(1);
    expect((await pauseRowsOf(session.id))[0]?.resumed_at).toBeNull();

    const resumed = await focus.resume(owner, session.id);
    expect(resumed.status).toBe("running");
    expect((await pauseRowsOf(session.id))[0]?.resumed_at).not.toBeNull();
  });

  it("is idempotent in both directions", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });

    await focus.pause(owner, session.id);
    await focus.pause(owner, session.id);
    expect(await pauseRowsOf(session.id)).toHaveLength(1);

    await focus.resume(owner, session.id);
    await focus.resume(owner, session.id);
    expect(await pauseRowsOf(session.id)).toHaveLength(1);
  });

  it("counts an interruption only when it is marked", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });

    expect(session.interruptionCount).toBe(0);
    expect((await focus.markInterruption(owner, session.id)).interruptionCount).toBe(1);
    expect((await focus.markInterruption(owner, session.id)).interruptionCount).toBe(2);
  });

  /* ---------------------------------------------------------------------- */
  /* Finishing                                                               */
  /* ---------------------------------------------------------------------- */

  it("records the measured minutes on the session and adds them to the task", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });
    await startedMinutesAgo(session.id, 25);

    const finished = await focus.finish(owner, session.id);

    expect(finished.status).toBe("completed");
    expect(finished.actualMinutes).toBe(25);
    expect(finished.endedAt).not.toBeNull();
    expect(await actualMinutesOf(taskId)).toBe(25);
  });

  it("excludes paused time from the recorded minutes", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 60,
      taskId,
      projectId: null,
    });
    await startedMinutesAgo(session.id, 60);

    // A pause opened 40 minutes ago and still open: 40 minutes of work, then a
    // 20-minute pause that the finish closes.
    await focus.pause(owner, session.id);
    const { error } = await admin
      .from("focus_pauses")
      .update({ paused_at: new Date(Date.now() - 20 * 60_000).toISOString() })
      .eq("session_id", session.id);
    if (error) throw error;

    const finished = await focus.finish(owner, session.id);

    expect(finished.actualMinutes).toBe(40);
    expect(await actualMinutesOf(taskId)).toBe(40);
  });

  it("awards XP once, however many times the finish is retried", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });
    await startedMinutesAgo(session.id, 25);

    const first = await focus.finish(owner, session.id);
    const retry = await focus.finish(owner, session.id);
    const third = await focus.finish(owner, session.id);

    // 25 minutes, planned length reached: 25 + 10%.
    expect(await xpFor(session.id)).toEqual([27]);
    expect(retry.actualMinutes).toBe(first.actualMinutes);
    expect(third.endedAt).toBe(first.endedAt);
    // And the task's minutes moved exactly once.
    expect(await actualMinutesOf(taskId)).toBe(25);
  });

  it("awards nothing for a session below the minimum, and still records the time", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });
    await startedMinutesAgo(session.id, 4);

    const finished = await focus.finish(owner, session.id);

    expect(finished.actualMinutes).toBe(4);
    expect(await xpFor(session.id)).toEqual([]);
    expect(await actualMinutesOf(taskId)).toBe(4);
  });

  it("caps one session", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 240,
      taskId,
      projectId: null,
    });
    await startedMinutesAgo(session.id, 240);

    await focus.finish(owner, session.id);

    expect(await xpFor(session.id)).toEqual([120]);
  });

  it("caps the day across sessions", async () => {
    // Whatever already sits in the rolling 24h window (the seed's own recent
    // focus sessions on a fresh reset); the suite's sessions can only fill the
    // rest of the 300 the window allows.
    const already = await focusXpInWindow();
    const headroom = Math.max(0, 300 - already);

    let awarded = 0;
    const ids: string[] = [];

    for (let n = 0; n < 4; n += 1) {
      const session = await focus.start(owner, {
        id: id(),
        plannedMinutes: 240,
        taskId,
        projectId: null,
      });
      await startedMinutesAgo(session.id, 240);
      await focus.finish(owner, session.id);
      ids.push(session.id);
      awarded += (await xpFor(session.id))[0] ?? 0;
    }

    // Sessions of 120 fill the remaining headroom, then nothing is left: the
    // rolling window holds the total at 300 however many sessions are run.
    expect(awarded).toBe(headroom);
    expect(await focusXpInWindow()).toBe(300);
    expect(await xpFor(ids[3] as string)).toEqual([]);
  });

  it("ends a session early without XP and still records the minutes", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 50,
      taskId,
      projectId: null,
    });
    await startedMinutesAgo(session.id, 30);

    const ended = await focus.abandon(owner, session.id);

    expect(ended.status).toBe("abandoned");
    expect(ended.actualMinutes).toBe(30);
    expect(await actualMinutesOf(taskId)).toBe(30);
    expect(await xpFor(session.id)).toEqual([]);
  });

  it("frees the account to start another session once one has ended", async () => {
    const first = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });
    await focus.abandon(owner, first.id);

    const second = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });

    expect(second.status).toBe("running");
  });

  it("leaves the estimate alone (Domain Rule 3)", async () => {
    const session = await focus.start(owner, {
      id: id(),
      plannedMinutes: 25,
      taskId,
      projectId: null,
    });
    await startedMinutesAgo(session.id, 25);
    await focus.finish(owner, session.id);

    const task = await tasks.findById(owner, taskId);
    expect(task?.estimatedMinutes).toBe(120);
  });
});
