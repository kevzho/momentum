import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FOCUS_XP } from "@momentum/core/focus";

/**
 * Pins `FOCUS_XP` in `@momentum/core/focus` to the numbers `xp_rule()` returns
 * in SQL. Changing a tunable is a migration *and* a change in `xp.ts`.
 */

const MIGRATIONS = join(import.meta.dirname, "../../../supabase/migrations");
const MIGRATION = join(MIGRATIONS, "20260907130000_focus_functions.sql");

function migrationSql(): string {
  return readFileSync(MIGRATION, "utf8");
}

/** The newest migration defining `xp_rule()` — later ones `create or replace` it. */
function xpRuleSql(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const defining = files
    .map((name) => readFileSync(join(MIGRATIONS, name), "utf8"))
    .filter((sql) => /create (or replace )?function public\.xp_rule\b/.test(sql));

  const last = defining.at(-1);
  if (last === undefined) throw new Error("no migration defines xp_rule()");
  return last;
}

/** SQL with comment lines stripped, so a number in prose can never satisfy a rule. */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function statements(): string {
  return withoutComments(migrationSql());
}

/** The integer `xp_rule()` returns for a name, read out of the `case` expression. */
function ruleValue(name: string): number | null {
  const match = new RegExp(`when\\s+'${name}'\\s*then\\s+(-?\\d+)`).exec(
    withoutComments(xpRuleSql()),
  );
  return match ? Number(match[1]) : null;
}

describe("xp_rule() and FOCUS_XP state the same numbers", () => {
  const pairs: [string, number][] = [
    ["focus_per_minute", FOCUS_XP.perMinute],
    ["focus_min_session_minutes", FOCUS_XP.minSessionMinutes],
    ["focus_session_cap", FOCUS_XP.sessionCap],
    ["focus_daily_cap", FOCUS_XP.dailyCap],
    ["focus_planned_bonus_pct", FOCUS_XP.plannedBonusPct],
    ["priority_bonus_p1", FOCUS_XP.priorityBonusP1],
  ];

  for (const [name, expected] of pairs) {
    it(`${name} is ${expected} in both`, () => {
      expect(ruleValue(name)).toBe(expected);
    });
  }

  it("finds nothing for a rule that does not exist, so a typo above cannot pass", () => {
    expect(ruleValue("focus_per_hour")).toBeNull();
  });
});

describe("the focus functions keep their invariants", () => {
  const sql = statements();

  it("stamps every focus timestamp with the database clock, never an argument", () => {
    const signatures =
      /create function public\.(start_focus_session|pause_focus_session|resume_focus_session|mark_interruption|finish_focus_session|abandon_focus_session|end_focus_session)\s*\(([^)]*)\)/g;

    const offenders: string[] = [];
    for (const match of sql.matchAll(signatures)) {
      const [, name = "", args = ""] = match;
      if (/timestamptz|timestamp\b/.test(args)) offenders.push(name);
    }

    expect(offenders).toEqual([]);
  });

  it("awards XP through one insert, guarded by the ledger's uniqueness", () => {
    const inserts = sql.match(/insert into public\.xp_events/g) ?? [];

    expect(inserts).toHaveLength(1);
    expect(sql).toMatch(/insert into public\.xp_events[\s\S]*?on conflict do nothing/);
  });

  it("returns an already-ended session unchanged before it reads a clock or writes", () => {
    const body = /create function public\.end_focus_session[\s\S]*?\$\$;/.exec(sql)?.[0] ?? "";
    const earlyReturn = body.indexOf("if v_row.status in ('completed', 'abandoned') then");
    const ledgerInsert = body.indexOf("insert into public.xp_events");
    const taskUpdate = body.indexOf("update public.tasks");

    expect(earlyReturn).toBeGreaterThan(-1);
    expect(earlyReturn).toBeLessThan(taskUpdate);
    expect(earlyReturn).toBeLessThan(ledgerInsert);
  });

  it("opens the trusted flag only around the guarded task write", () => {
    const body = /create function public\.end_focus_session[\s\S]*?\$\$;/.exec(sql)?.[0] ?? "";

    expect(body.match(/set_config\('momentum\.trusted', 'on', true\)/g) ?? []).toHaveLength(1);
    expect(body.match(/set_config\('momentum\.trusted', 'off', true\)/g) ?? []).toHaveLength(1);
  });

  it("grants exactly the six lifecycle functions and keeps the helpers internal", () => {
    const granted = [...sql.matchAll(/grant execute on function public\.(\w+)\(/g)].map(
      (match) => match[1],
    );

    expect(granted.sort()).toEqual([
      "abandon_focus_session",
      "finish_focus_session",
      "mark_interruption",
      "pause_focus_session",
      "resume_focus_session",
      "start_focus_session",
    ]);
    expect(granted).not.toContain("end_focus_session");
    expect(granted).not.toContain("xp_rule");
    expect(granted).not.toContain("focus_session_elapsed_minutes");
  });
});
