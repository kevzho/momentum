import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_RULES,
  LEVEL_CURVE,
  QUEST_SLOTS,
  QUEST_TARGET_CAPS,
  REWARD_XP,
  TASK_XP,
  XP_DAILY_CAPS,
  isHealthyQuestTarget,
  questRotationOffset,
} from "@momentum/core/gamification";
import { QUEST_METRICS, QUEST_PERIODS } from "@momentum/core/types";

/**
 * The Phase 8 migration, read as text.
 *
 * Two jobs, and they are the same two `focus-rules.test.ts` does for Phase 7.
 *
 * **The mirrors are pinned.** `@momentum/core/gamification` states the level
 * curve, the task award, the daily caps and the quest rotation so the interface
 * can show them without a round trip and so they can be tested exhaustively
 * without Docker. Two copies of a rule is the duplication `CLAUDE.md` forbids,
 * so every number here is compared with the one `xp_rule()` returns. Changing a
 * tunable is a migration *and* a one-line change in `core`, or this file goes
 * red.
 *
 * **The structure is asserted.** Some of what Phase 8 claims cannot be shown by
 * calling a function — that no granted function takes an amount, that every
 * ledger insert is guarded by the idempotency index, that nothing in the file
 * ever lowers a total. Those are statements about the *text*, so they are made
 * here. A database suite proves the behaviour when there is a database
 * (`packages/db/tests/gamification.test.ts`); this proves the shape on every
 * `pnpm test`.
 */

const MIGRATIONS = join(import.meta.dirname, "../../../supabase/migrations");
const MIGRATION = join(MIGRATIONS, "20260907140000_gamification_functions.sql");
const DEFINITIONS = join(MIGRATIONS, "20260906121100_definitions.sql");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** SQL with comment lines stripped, so a number in prose can never satisfy a rule. */
function statements(path = MIGRATION): string {
  return read(path)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function ruleValue(name: string): number | null {
  const match = new RegExp(`when\\s+'${name}'\\s*then\\s+(-?\\d+)`).exec(statements());
  return match ? Number(match[1]) : null;
}

describe("xp_rule() and @momentum/core/gamification state the same numbers", () => {
  const pairs: [string, number][] = [
    ["task_base", TASK_XP.base],
    ["priority_bonus_p1", TASK_XP.priorityBonusP1],
    ["task_significant_minutes", TASK_XP.significantMinutes],
    ["task_significant_bonus", TASK_XP.significantBonus],
    ["task_daily_cap", XP_DAILY_CAPS.task as number],
    ["habit_daily_cap", XP_DAILY_CAPS.habit_completion as number],
    ["focus_daily_cap", XP_DAILY_CAPS.focus_session as number],
    ["weekly_goal_base", REWARD_XP.weeklyGoal],
    ["weekly_goal_coins", REWARD_XP.weeklyGoalCoins],
    ["achievement_base", REWARD_XP.achievement],
    ["deep_work_minutes", ACHIEVEMENT_RULES.deepWorkMinutes],
    ["consistency_weeks", ACHIEVEMENT_RULES.consistencyWeeks],
    ["early_bird_blocks", ACHIEVEMENT_RULES.earlyBirdBlocks],
    ["early_bird_before_hour", ACHIEVEMENT_RULES.earlyBirdBeforeHour],
    ["planner_tasks", ACHIEVEMENT_RULES.plannerTasks],
    ["level_curve_base", LEVEL_CURVE.base],
    ["level_curve_exponent_pct", LEVEL_CURVE.exponentPct],
    ["daily_quest_slots", QUEST_SLOTS.daily],
    ["weekly_quest_slots", QUEST_SLOTS.weekly],
  ];

  for (const [name, expected] of pairs) {
    it(`${name} is ${expected} in both`, () => {
      expect(ruleValue(name)).toBe(expected);
    });
  }

  it("finds nothing for a rule that does not exist, so a typo above cannot pass", () => {
    expect(ruleValue("task_bonus_for_trying")).toBeNull();
  });

  it("defers the focus cap to the focus tunable rather than restating it", () => {
    // Two numbers that must agree and are written once. `xp_daily_cap` reads
    // `xp_rule('focus_daily_cap')`, so the ledger's cap and the focus award's
    // own arithmetic cannot drift apart.
    expect(statements()).toMatch(
      /when 'focus_session'\s+then public\.xp_rule\('focus_daily_cap'\)/,
    );
  });
});

describe("the ledger is the only mint, and it mints once", () => {
  const sql = statements();

  it("inserts into xp_events in exactly one place, guarded by the uniqueness index", () => {
    const inserts = sql.match(/insert into public\.xp_events/g) ?? [];
    expect(inserts).toHaveLength(1);

    const body = sql.slice(sql.indexOf("insert into public.xp_events"));
    expect(body.slice(0, 400)).toContain("on conflict do nothing");
  });

  it("refuses an award with no source id, because that award could not be idempotent", () => {
    expect(sql).toMatch(/if p_source_id is null then\s+raise exception/);
  });

  it("never lowers a total: profiles.xp is only ever added to or reconciled", () => {
    const assignments = sql.match(/set\s+xp\s*=\s*([^,\n]+)/g) ?? [];
    expect(assignments.length).toBeGreaterThan(0);
    for (const assignment of assignments) {
      // `p.xp + new.amount` in the trigger, `v_total` in reconcile_xp. Nothing
      // subtracts, and nothing takes a number from an argument (Domain Rule 7).
      expect(assignment).toMatch(/p\.xp \+ new\.amount|v_total/);
    }
    expect(sql).not.toMatch(/set\s+xp\s*=\s*[^,\n]*-\s/);
    expect(sql).not.toMatch(/delete from public\.xp_events/);
    expect(sql).not.toMatch(/update public\.xp_events/);
  });

  it("keys every award on something a delete cannot reset", () => {
    // A weekly goal is the one claimable thing the user creates and can
    // destroy, so its award is keyed on (user, week, metric) rather than on the
    // row id — otherwise delete-and-recreate would mint a second one.
    expect(sql).toContain(
      "public.weekly_goal_award_id(v_row.user_id, v_row.week_start, v_row.metric)",
    );
    expect(sql).toMatch(/create function public\.weekly_goal_award_id/);
  });
});

describe("no client path can submit an amount", () => {
  const sql = statements();

  const granted = [
    "ensure_quest_assignments",
    "quest_progress",
    "claim_quest",
    "weekly_goal_progress",
    "claim_weekly_goal",
    "purchase_cosmetic",
  ];

  /** Names granted to a role, read out of the migration's own grant statements. */
  function grantedTo(role: string): Set<string> {
    const pattern = new RegExp(
      `grant execute on function public\\.(\\w+)\\s*\\([^)]*\\)\\s*to ${role};`,
      "g",
    );
    return new Set([...sql.matchAll(pattern)].map((match) => match[1] as string));
  }

  /**
   * The whole exposure matrix, not just this phase's part of it.
   *
   * The revoke above strips every function, so this file is now the single
   * place the reachable surface is declared — twenty-three functions across
   * five phases. A phase that adds one without adding it here leaves it
   * unreachable, which is the safe direction to fail in.
   */
  const SANCTIONED = [
    // Phase 2 — the helpers the guard triggers call as the signed-in role.
    "is_trusted",
    "is_valid_timezone",
    "reject_guarded_write",
    // Phase 3
    "complete_block",
    "uncomplete_block",
    "complete_task",
    "uncomplete_task",
    // Phase 6
    "record_habit_completion",
    "remove_habit_completion",
    "complete_habit_block",
    "uncomplete_habit_block",
    // Phase 7
    "start_focus_session",
    "pause_focus_session",
    "resume_focus_session",
    "mark_interruption",
    "finish_focus_session",
    "abandon_focus_session",
    // Phase 8
    ...granted,
  ];

  it("grants exactly the sanctioned surface to a signed-in client", () => {
    expect(grantedTo("authenticated")).toEqual(new Set(SANCTIONED));
    expect(SANCTIONED).toHaveLength(23);
  });

  it("keeps the mint, the arithmetic and the internals unreachable by a client", () => {
    const reachable = grantedTo("authenticated");
    for (const internal of [
      "award_xp",
      "award_coins",
      "reconcile_xp",
      "level_for_xp",
      "xp_for_level",
      "xp_daily_cap",
      "metric_progress",
      "assign_quests",
      "achievement_earned",
      "evaluate_achievements",
      "quest_rotation_offset",
      "quest_assignment_id",
      "weekly_goal_award_id",
      "habit_week_met",
      "local_week_start",
    ]) {
      expect(reachable.has(internal), internal).toBe(false);
    }
  });

  it("opens the reconciliation helpers to the audit key only", () => {
    // `service_role` is an operator's key, never a browser's: it already
    // bypasses row-level security, so this adds no reach a client could use.
    expect(grantedTo("service_role")).toEqual(
      new Set(["reconcile_xp", "xp_for_level", "level_for_xp", "local_week_start"]),
    );
  });

  it("takes no amount, no progress and no timestamp in any granted signature", () => {
    for (const name of granted) {
      const signature = new RegExp(`create function public\\.${name}\\s*\\(([^)]*)\\)`).exec(sql);
      expect(signature, `${name} is defined`).not.toBeNull();
      const args = (signature?.[1] ?? "").toLowerCase();
      expect(args).not.toMatch(/amount|xp|coin|progress|timestamptz|reward|level/);
    }
  });

  it("recomputes progress before it writes, in both claim paths", () => {
    for (const name of ["claim_quest", "claim_weekly_goal"]) {
      const body = sql.slice(sql.indexOf(`create function public.${name}`));
      const check = body.indexOf("is not finished yet");
      const write = body.indexOf("set completed_at = now()");
      expect(check).toBeGreaterThan(-1);
      expect(write).toBeGreaterThan(check);
    }
  });

  it("resolves the quest period from the profile rather than from a caller", () => {
    expect(sql).toMatch(/create function public\.ensure_quest_assignments\(\)/);
    const body = sql.slice(sql.indexOf("create function public.ensure_quest_assignments"));
    expect(body).toContain("(now() at time zone v_zone)::date");
  });
});

describe("no quest target can encourage unhealthy work", () => {
  const sql = statements();

  it("bounds every (period, metric) pair the enum can express", () => {
    for (const period of QUEST_PERIODS) {
      for (const metric of QUEST_METRICS) {
        const pattern = new RegExp(
          `when period = '${period}'\\s+and metric = '${metric}'\\s+then target <= (\\d+)`,
        );
        const match = pattern.exec(sql);
        expect(match, `${period}/${metric} is bounded`).not.toBeNull();
        expect(Number(match?.[1])).toBe(QUEST_TARGET_CAPS[period][metric]);
      }
    }
  });

  it("refuses a metric nobody has decided a healthy amount for", () => {
    const check = sql.slice(sql.indexOf("add constraint quest_definitions_volume_chk"));
    expect(check.slice(0, 1_400)).toMatch(/else false/);
  });

  it("never allows a quest to ask for eight hours of focus", () => {
    expect(QUEST_TARGET_CAPS.daily.focus_minutes).toBeLessThanOrEqual(120);
    expect(isHealthyQuestTarget("daily", "focus_minutes", 480)).toBe(false);
  });

  it("seeds only targets the caps allow", () => {
    const seeded = [
      ...statements(DEFINITIONS).matchAll(
        /\('[a-z_0-9]+',\s*'(daily|weekly)',\s*'(\w+)',\s*(\d+),/g,
      ),
    ];
    expect(seeded.length).toBeGreaterThanOrEqual(9);
    for (const [, period, metric, target] of seeded) {
      expect(
        isHealthyQuestTarget(
          period as (typeof QUEST_PERIODS)[number],
          metric as (typeof QUEST_METRICS)[number],
          Number(target),
        ),
        `${period}/${metric} target ${target}`,
      ).toBe(true);
    }
  });
});

describe("the quest rotation is the same rule in both languages", () => {
  const sql = statements();

  it("reads the account offset from the last four hex digits of the uuid", () => {
    expect(sql).toContain("right(replace(p_user_id::text, '-', ''), 4)");
    // The TypeScript mirror reads the same four characters.
    expect(questRotationOffset("00000000-0000-0000-0000-00000000abcd")).toBe(0xabcd);
  });

  it("rotates from the same epoch and wraps the same way", () => {
    expect(sql).toContain("p_period_start - date '1970-01-01'");
    expect(sql).toMatch(/% v_count \+ v_count\) % v_count/);
  });

  it("orders the pool by key, which is what makes the two selections agree", () => {
    const body = sql.slice(sql.indexOf("create function public.assign_quests"));
    expect(body).toContain("row_number() over (order by d.key)");
  });
});

describe("the achievement conditions and the text a user reads agree", () => {
  const sql = statements();

  it("brings the seeded descriptions to this phase's conditions", () => {
    expect(sql).toContain("Finish a focus session of 90 minutes or more.");
    expect(sql).toContain("Complete ten scheduled blocks before noon.");
    expect(sql).toMatch(/five weeks — they do not have to be in a row/);
  });

  it("quotes the same numbers the conditions check", () => {
    expect(ruleValue("deep_work_minutes")).toBe(90);
    expect(ruleValue("early_bird_blocks")).toBe(10);
    expect(ruleValue("early_bird_before_hour")).toBe(12);
  });

  it("runs the trigger as the owner, so the evaluator can stay ungranted", () => {
    // A client inserts its own calendar blocks, so this trigger runs as
    // `authenticated` on that path; without `security definer` it could not
    // call `evaluate_achievements`, and block creation would fail outright.
    const body = sql.slice(sql.indexOf("create function public.evaluate_achievements_touched"));
    expect(body.slice(0, 260)).toContain("security definer");
  });

  it("watches the four tables an achievement can become true from", () => {
    for (const table of [
      "on public.tasks",
      "on public.calendar_blocks",
      "on public.focus_sessions",
      "on public.habit_completions",
    ]) {
      expect(sql).toContain(`${table}\n  referencing new table as inserted`);
    }

    // Six triggers over four tables, and not by preference: Postgres refuses a
    // transition table on a trigger with a column list *or* with more than one
    // event, so `calendar_blocks` and `habit_completions` each need one for
    // insert and one for update.
    const statements =
      sql.match(/for each statement execute function public\.evaluate_achievements_touched/g) ?? [];
    expect(statements).toHaveLength(6);
    expect(sql).not.toMatch(/referencing new table as inserted\n\s+for each row/);
  });

  it("narrows each evaluation to what that table could have made true", () => {
    // The column lists the triggers cannot carry move inside the function, which
    // narrows the work rather than merely the firing: a task update checks two
    // conditions, and never the one that walks a habit's whole history.
    const body = sql.slice(sql.indexOf("create function public.evaluate_achievements_touched"));
    expect(body).toContain("when 'tasks'             then array['first_step', 'project_finisher']");
    expect(body).toContain("when 'habit_completions' then array['consistency']");
  });

  it("does nothing for a write with no signed-in caller, so the seed decides its own state", () => {
    const body = sql.slice(sql.indexOf("create function public.evaluate_achievements_touched"));
    expect(body.slice(0, 900)).toMatch(/if v_user is null or v_keys is null then\s+return null;/);
  });

  it("revokes the function surface by name rather than by default privileges", () => {
    // The first live run of these migrations showed that
    // `alter default privileges ... revoke execute` did not reach functions
    // created afterwards: every one of them carried PUBLIC EXECUTE and was
    // callable by any signed-in account, `award_xp` among them. A security
    // boundary may not rest on that difference.
    expect(sql).toMatch(/revoke execute on function %s from public, anon, authenticated/);
    for (const regranted of [
      "public.is_trusted()",
      "public.complete_task(uuid)",
      "public.record_habit_completion(uuid, date, integer, uuid)",
      "public.finish_focus_session(uuid)",
      "public.claim_quest(uuid)",
    ]) {
      expect(sql).toContain(`grant execute on function ${regranted}`);
    }
  });

  it("evaluates all six starters and nothing else", () => {
    const body = sql.slice(sql.indexOf("create function public.achievement_earned"));
    for (const key of [
      "first_step",
      "deep_work",
      "consistency",
      "early_bird",
      "planner",
      "project_finisher",
    ]) {
      expect(body).toContain(`when '${key}' then`);
    }
    // An unknown key is not earned, rather than an error a trigger would raise.
    expect(body).toMatch(/else\s+return false;/);
  });
});

describe("coins buy cosmetics only", () => {
  const sql = statements();

  it("sells only what the product renders", () => {
    expect(sql).toContain("set available = (kind = 'profile_frame')");
    const body = sql.slice(sql.indexOf("create function public.purchase_cosmetic"));
    expect(body).toContain("if not v_def.available then");
  });

  it("checks the balance before it debits, in one transaction", () => {
    const body = sql.slice(sql.indexOf("create function public.purchase_cosmetic"));
    const check = body.indexOf("if v_coins < v_def.price then");
    const debit = body.indexOf("set coins = p.coins - v_def.price");
    expect(check).toBeGreaterThan(-1);
    expect(debit).toBeGreaterThan(check);
  });

  it("has no path that sells anything but a cosmetic", () => {
    // Nothing in this file grants time, capacity, XP or a quest skip for coins.
    const spends = sql.match(/coins = p\.coins - [^;\n]+/g) ?? [];
    expect(spends).toHaveLength(1);
    expect(spends[0]).toContain("v_def.price");
  });
});
