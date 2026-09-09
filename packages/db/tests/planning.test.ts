import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";

import * as tasks from "../src/repositories/tasks";
import * as weeklyGoals from "../src/repositories/weekly-goals";
import {
  adminClient,
  DB_TESTS_ENABLED,
  SEED_USERS,
  signIn,
  userIdOf,
  type TestClient,
} from "./support/harness";

/**
 * The planning drawer's reads, proved against a real database. Run with
 * `MOMENTUM_DB_TESTS=1 pnpm test`. The seed's own overdue tasks also satisfy
 * `due_date < 2030-03-04`, so assertions are about the fixtures' presence,
 * absence and relative order, never the whole result.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

/** A Monday. The dates around it are the fixtures' deadlines and the goals' week. */
const TODAY = localDate("2030-03-04");
const WEEK = localDate("2030-03-04");
const NEXT_WEEK = localDate("2030-03-11");

describeDb("planning reads", () => {
  let owner: TestClient;
  let neighbour: TestClient;
  let ownerId: string;
  let neighbourId: string;

  /** Everything a test created, deleted afterwards through the client that owns it. */
  const created: { client: () => TestClient; table: "tasks" | "weekly_goals"; id: string }[] = [];

  beforeAll(async () => {
    owner = await signIn(SEED_USERS.owner);
    neighbour = await signIn(SEED_USERS.neighbour);
    ownerId = await userIdOf(owner);
    neighbourId = await userIdOf(neighbour);
    expect(ownerId).not.toBe(neighbourId);
  });

  afterEach(async () => {
    // Reverse creation order removes children before their cascading parent.
    for (const row of [...created].reverse()) {
      await row.client().from(row.table).delete().eq("id", row.id);
    }
    created.length = 0;
  });

  async function insertTask(
    client: TestClient,
    userId: string,
    task: {
      title: string;
      dueDate: string | null;
      priority?: number;
      sortOrder?: number;
      parentTaskId?: string;
    },
  ): Promise<string> {
    const { data, error } = await client
      .from("tasks")
      .insert({
        user_id: userId,
        title: task.title,
        due_date: task.dueDate,
        ...(task.priority === undefined ? {} : { priority: task.priority }),
        ...(task.sortOrder === undefined ? {} : { sort_order: task.sortOrder }),
        ...(task.parentTaskId === undefined ? {} : { parent_task_id: task.parentTaskId }),
      })
      .select("id")
      .single();
    if (error) throw error;
    created.push({ client: () => client, table: "tasks", id: data.id });
    return data.id;
  }

  async function insertGoal(
    client: TestClient,
    userId: string,
    goal: { weekStart: string; metric: "tasks_completed" | "focus_minutes" | "blocks_completed" },
  ): Promise<string> {
    // Service role, because guard_weekly_goals only lets a client create goals
    // for its current week and these fixtures live in a far, fixed week.
    const admin = adminClient();
    const { data, error } = await admin
      .from("weekly_goals")
      .insert({ user_id: userId, week_start: goal.weekStart, metric: goal.metric, target: 3 })
      .select("id")
      .single();
    if (error) throw error;
    created.push({ client: () => client, table: "weekly_goals", id: data.id });
    return data.id;
  }

  describe("listOverdue", () => {
    it("returns open, unarchived, top-level tasks due before the date, and nothing else", async () => {
      const overdue = await insertTask(owner, ownerId, {
        title: "Fixture: due last week",
        dueDate: "2030-03-01",
      });
      const dueToday = await insertTask(owner, ownerId, {
        title: "Fixture: due today",
        dueDate: TODAY,
      });
      const undated = await insertTask(owner, ownerId, {
        title: "Fixture: no deadline",
        dueDate: null,
      });
      const subtask = await insertTask(owner, ownerId, {
        title: "Fixture: subtask of an overdue task",
        dueDate: "2030-03-01",
        parentTaskId: overdue,
      });

      const archived = await insertTask(owner, ownerId, {
        title: "Fixture: archived and overdue",
        dueDate: "2030-03-01",
      });
      await tasks.setArchived(owner, archived, true);

      const completed = await insertTask(owner, ownerId, {
        title: "Fixture: completed and overdue",
        dueDate: "2030-03-01",
      });
      await tasks.complete(owner, completed);

      const ids = (await tasks.listOverdue(owner, ownerId, TODAY)).map((task) => task.id);

      expect(ids).toContain(overdue);
      // Strict: a task due today is today's, not overdue.
      expect(ids).not.toContain(dueToday);
      expect(ids).not.toContain(undated);
      expect(ids).not.toContain(subtask);
      expect(ids).not.toContain(archived);
      expect(ids).not.toContain(completed);
    });

    it("orders by deadline, then priority, then the user's own order", async () => {
      const later = await insertTask(owner, ownerId, {
        title: "Fixture: due 3 March, P1",
        dueDate: "2030-03-03",
        priority: 1,
      });
      const earlierP4 = await insertTask(owner, ownerId, {
        title: "Fixture: due 1 March, P4, sorted second",
        dueDate: "2030-03-01",
        priority: 4,
        sortOrder: 20,
      });
      const earlierP4First = await insertTask(owner, ownerId, {
        title: "Fixture: due 1 March, P4, sorted first",
        dueDate: "2030-03-01",
        priority: 4,
        sortOrder: 10,
      });
      const earlierP2 = await insertTask(owner, ownerId, {
        title: "Fixture: due 1 March, P2",
        dueDate: "2030-03-01",
        priority: 2,
        sortOrder: 30,
      });

      const fixtures = new Set([later, earlierP4, earlierP4First, earlierP2]);
      const ids = (await tasks.listOverdue(owner, ownerId, TODAY))
        .map((task) => task.id)
        .filter((id) => fixtures.has(id));

      // Most past-due first even at the lowest priority; then priority, then sort order.
      expect(ids).toEqual([earlierP2, earlierP4First, earlierP4, later]);
    });

    it("sees none of another account's overdue tasks", async () => {
      const theirs = await insertTask(neighbour, neighbourId, {
        title: "Fixture: the neighbour's overdue task",
        dueDate: "2030-03-01",
      });

      const rows = await tasks.listOverdue(owner, ownerId, TODAY);

      expect(rows.map((task) => task.id)).not.toContain(theirs);
      for (const task of rows) expect(task.userId).toBe(ownerId);

      expect(await tasks.listOverdue(owner, neighbourId, TODAY)).toEqual([]);
    });
  });

  describe("listForWeek", () => {
    it("returns only the caller's goals for that week, oldest first", async () => {
      const first = await insertGoal(owner, ownerId, {
        weekStart: WEEK,
        metric: "tasks_completed",
      });
      const second = await insertGoal(owner, ownerId, {
        weekStart: WEEK,
        metric: "focus_minutes",
      });
      const otherWeek = await insertGoal(owner, ownerId, {
        weekStart: NEXT_WEEK,
        metric: "tasks_completed",
      });
      const theirs = await insertGoal(neighbour, neighbourId, {
        weekStart: WEEK,
        metric: "tasks_completed",
      });

      const goals = await weeklyGoals.listForWeek(owner, ownerId, WEEK);
      const ids = goals.map((goal) => goal.id);

      expect(ids).toEqual([first, second]);
      expect(ids).not.toContain(otherWeek);
      expect(ids).not.toContain(theirs);
      for (const goal of goals) {
        expect(goal.userId).toBe(ownerId);
        expect(goal.weekStart).toBe(WEEK);
        expect(goal.completedAt).toBeNull();
      }
    });

    it("gives another account nothing for the same week, whichever id it asks with", async () => {
      await insertGoal(owner, ownerId, { weekStart: WEEK, metric: "blocks_completed" });

      expect(await weeklyGoals.listForWeek(neighbour, ownerId, WEEK)).toEqual([]);
      const theirOwn = await weeklyGoals.listForWeek(neighbour, neighbourId, WEEK);
      expect(theirOwn.every((goal) => goal.userId === neighbourId)).toBe(true);
    });
  });
});
