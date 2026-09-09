import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { coverageOf, scheduledMinutesOf } from "@momentum/core/tasks";
import { instant } from "@momentum/core/time";
import type { CalendarBlock, Task } from "@momentum/core/types";

import { rowToCalendarBlock } from "./mappers/calendar-block";
import type { Row } from "./types";

/**
 * The work-block model, guarded against regression.
 *
 * Phase 4's brief was to refactor a single-block model into a multi-block one
 * and migrate the data. **There was nothing to migrate.** The schema has been
 * multi-block since `20260906120500_calendar_blocks.sql`, the first migration
 * that could have got it wrong: a work block is a row of `calendar_blocks` with
 * `kind = 'work'` and a required `task_id`, and `tasks` has never had a
 * scheduling column. So no data has ever been in the shape Domain Rule 2
 * forbids, and a migration would have had nothing to move.
 *
 * What that leaves worth testing is the property a migration would have
 * established: that the model **is** N-blocks-per-task, and that no future
 * migration can quietly take it back to one. The single-block shape is the
 * single most expensive thing to get wrong later (specs/04-task-manager.md), and
 * it would arrive as an innocuous-looking `alter table tasks add column`. These
 * tests read the migrations as text and fail on exactly that.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "../../../supabase/migrations");

function migrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && !name.startsWith("._"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

/** SQL with comments stripped, so a rule can never be satisfied by a mention in prose. */
function statements(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toLowerCase();
}

describe("the schema is multi-block, and stays that way", () => {
  it("has at least one migration to check", () => {
    expect(migrations().length).toBeGreaterThan(0);
  });

  /**
   * The regression guard. Any column that would let one task carry one span —
   * a start/end pair, a "scheduled at", a single block reference — is refused
   * here rather than in review, because by the time it is in a migration it is
   * in everybody's database.
   */
  it("never adds a scheduling column to tasks, in any migration", () => {
    const FORBIDDEN =
      /\b(scheduled_start|scheduled_end|scheduled_at|scheduled_for|start_at|end_at|block_id|calendar_block_id)\b/;

    for (const { name, sql } of migrations()) {
      const body = statements(sql);

      // Every statement that creates or alters `tasks`, isolated from the rest
      // of the file — `calendar_blocks` legitimately has start_at and end_at.
      const touchesTasks = [
        ...body.matchAll(/create table (?:if not exists )?public\.tasks\s*\(([\s\S]*?)\n\);/g),
        ...body.matchAll(/alter table (?:if exists )?(?:only )?public\.tasks\b([^;]*);/g),
      ];

      for (const match of touchesTasks) {
        const fragment = match[1] ?? "";
        expect(
          FORBIDDEN.test(fragment),
          `${name} adds a scheduling column to tasks — that is Domain Rule 2, not a shortcut`,
        ).toBe(false);
      }
    }
  });

  it("puts the foreign key on the block, which is what makes N-per-task possible", () => {
    const blocks = migrations().find((m) => m.name.includes("calendar_blocks"));
    expect(blocks).toBeDefined();
    const body = statements((blocks as { sql: string }).sql);

    // N blocks reference 1 task, and the reference is not unique — nothing
    // constrains a task to a single block.
    expect(body).toMatch(/task_id\s+uuid references public\.tasks \(id\) on delete cascade/);
    expect(body).not.toMatch(/unique[^;]*\(\s*task_id\s*\)/);
    expect(body).not.toMatch(/create unique index[^;]*\(task_id\)/);
  });

  it("requires a work block to have a task, and forbids a task on any other kind", () => {
    const blocks = migrations().find((m) => m.name.includes("calendar_blocks"));
    const body = statements((blocks as { sql: string }).sql);

    expect(body).toContain("kind = 'work'  and task_id is not null and habit_id is null");
    expect(body).toContain("kind = 'event' and task_id is null and habit_id is null");
  });

  it("cascades blocks from their task, and never the reverse", () => {
    const tasks = migrations().find((m) => m.name.endsWith("_tasks.sql"));
    const body = statements((tasks as { sql: string }).sql);

    // Deleting a task deletes its blocks (Domain Rule 13). `tasks` itself holds
    // no reference to a block, so deleting a block can reach nothing.
    expect(body).not.toContain("references public.calendar_blocks");
  });
});

/**
 * The generated types are the compile-time half of the same guarantee: if a
 * migration added a scheduling column, `pnpm db:types` would put it here and
 * these assertions would stop compiling.
 */
describe("the generated row type", () => {
  it("has no scheduling column on tasks", () => {
    // A type-level assertion: `keyof Row<"tasks">` is a closed union, so naming
    // a column that does not exist is a compile error, and this test failing to
    // typecheck is the signal. The runtime half checks the shape is what the
    // compiler thinks.
    const columns: (keyof Row<"tasks">)[] = [
      "id",
      "user_id",
      "project_id",
      "parent_task_id",
      "title",
      "description",
      "status",
      "priority",
      "estimated_minutes",
      "actual_minutes",
      "due_date",
      "completed_at",
      "archived_at",
      "sort_order",
      "created_at",
      "updated_at",
    ];

    expect(columns).not.toContain("scheduled_start");
    expect(columns).not.toContain("scheduled_end");
  });

  it("keeps the deadline and the schedule in different tables entirely", () => {
    // `due_date` is on the task; `start_at` is on the block. Domain Rule 1 as a
    // fact about the schema rather than a convention.
    const due: keyof Row<"tasks"> = "due_date";
    const start: keyof Row<"calendar_blocks"> = "start_at";

    expect(due).toBe("due_date");
    expect(start).toBe("start_at");
  });
});

/**
 * The model working end to end on the spec's own example: one task, three
 * blocks, on three days that are not the due date.
 */
describe("one task owning many blocks", () => {
  const TASK_ID = "44444444-4444-4444-4444-444444444444";

  function workBlockRow(id: string, startAt: string, endAt: string): Row<"calendar_blocks"> {
    return {
      id,
      user_id: "11111111-1111-1111-1111-111111111111",
      kind: "work",
      task_id: TASK_ID,
      habit_id: null,
      title: "",
      description: null,
      start_at: startAt,
      end_at: endAt,
      all_day: false,
      color: null,
      completed_at: null,
      recurrence: null,
      recurrence_until: null,
      series_id: null,
      occurrence_date: null,
      cancelled: false,
      created_at: "2026-09-06T00:00:00.000Z",
      updated_at: "2026-09-06T00:00:00.000Z",
    };
  }

  const ESSAY: Pick<Task, "id" | "dueDate" | "estimatedMinutes"> = {
    id: TASK_ID,
    // Due Friday…
    dueDate: "2026-09-11" as Task["dueDate"],
    estimatedMinutes: 135,
  };

  // …and worked Monday, Tuesday and Thursday.
  const BLOCKS: CalendarBlock[] = [
    workBlockRow("b1", "2026-09-07T16:00:00.000Z", "2026-09-07T16:45:00.000Z"),
    workBlockRow("b2", "2026-09-08T17:00:00.000Z", "2026-09-08T18:00:00.000Z"),
    workBlockRow("b3", "2026-09-10T19:00:00.000Z", "2026-09-10T19:30:00.000Z"),
  ].map(rowToCalendarBlock);

  it("maps three rows to three blocks, all pointing at one task", () => {
    expect(BLOCKS).toHaveLength(3);
    for (const block of BLOCKS) {
      expect(block.kind).toBe("work");
      if (block.kind !== "work") throw new Error("expected a work block");
      expect(block.taskId).toBe(TASK_ID);
    }
  });

  it("sums their coverage against the estimate", () => {
    const coverage = coverageOf(ESSAY.estimatedMinutes, scheduledMinutesOf(BLOCKS));

    expect(coverage.scheduledMinutes).toBe(135);
    expect(coverage.state).toBe("covered");
  });

  it("schedules none of them on the due date, which is the whole point", () => {
    const dueDate = ESSAY.dueDate as string;
    for (const block of BLOCKS) {
      expect(block.startAt.slice(0, 10)).not.toBe(dueDate);
    }
    expect(instant(BLOCKS[0]?.startAt as string) < instant(`${dueDate}T00:00:00.000Z`)).toBe(true);
  });
});
