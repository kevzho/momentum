-- Momentum — security hardening: weekly goals can only be set for the week the
-- user is actually in, and their target is bounded in the database.
--
-- The audit (2026-09-09) confirmed the product's most serious farm against the
-- live stack. `weekly_goals` is fully client-insertable, and its award is keyed
-- on `(user, week_start, metric)` — a key chosen so that deleting and recreating
-- a goal cannot re-mint (docs/DOMAIN_RULES.md). But nothing required `week_start`
-- to be a real week boundary or the current week: the "resolved from the profile,
-- never sent" rule lived only in the server action, which a direct PostgREST call
-- bypasses. `claim_weekly_goal` recomputes progress over
-- `[week_start, week_start + 7)` and awards a flat 50 XP + 20 coins, uncapped
-- (weekly_goal has no daily cap by design — the per-(week,metric) key was meant
-- to be the bound).
--
-- So a signed-in user could POST one goal per calendar DATE per metric
-- (week_start = every day from first activity to today, six metrics each), whose
-- overlapping 7-day windows all count the same completed work, then claim every
-- one — hundreds of claims of 50 XP + 20 coins against a single afternoon's
-- history. Reproduced live: a neighbour with one completed task minted +50 XP and
-- +20 coins per claim across consecutive week_start values.
--
-- The fix moves the invariant the server action assumed into the database, where
-- PostgREST cannot get around it:
--
--   * On INSERT, `week_start` must equal the FIRST DAY of the CURRENT week in the
--     user's own timezone and week-start preference — exactly what
--     `createWeeklyGoal` computes. This makes every goal's window week-aligned
--     (so two goals' windows can never overlap) AND current (so history cannot be
--     farmed retroactively; a real week yields at most one goal per metric, once,
--     which is the intended pacing).
--
--   * On UPDATE, `week_start`, `metric` and `target` are frozen for a non-trusted
--     caller, so the insert-time check cannot be sidestepped by creating a valid
--     current-week goal and then PATCHing its week or metric to a farmed one.
--     (`completed_at` was already frozen; claiming goes through the trusted
--     function.)
--
-- And the target gains the database upper bound the app already claims it has:
-- `weekly_goals_target_chk` only checked `> 0`, so `QUEST_TARGET_CAPS.weekly`
-- (Domain Rule 7) was enforced by zod alone. The reward is flat, so this is a
-- health rule rather than an anti-farm one, but the documented invariant should
-- hold at the boundary that actually persists the row.

-- ---------------------------------------------------------------------------
-- Target upper bound (mirrors QUEST_TARGET_CAPS.weekly and quest_definitions_volume_chk)
-- ---------------------------------------------------------------------------

alter table public.weekly_goals
  add constraint weekly_goals_target_cap_chk check (
    case metric
      when 'tasks_completed'          then target <= 25
      when 'priority_tasks_completed' then target <= 10
      when 'focus_minutes'            then target <= 360
      when 'habits_completed'         then target <= 35
      when 'habit_days'               then target <= 7
      when 'blocks_completed'         then target <= 30
      else false
    end
  );

-- ---------------------------------------------------------------------------
-- The guard: current-week on insert, immutable key on update
-- ---------------------------------------------------------------------------

create or replace function public.guard_weekly_goals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_zone      text;
  v_week      smallint;
  v_this_week date;
begin
  -- This guard constrains the PostgREST client, which always acts as the
  -- `authenticated` role. Trusted database logic (claim_weekly_goal), the seed
  -- and service-role/admin fixtures set arbitrary weeks on purpose — the seed
  -- already backdates history the same way — so they are exempt, exactly as they
  -- are exempt from the column guards via is_trusted().
  if public.is_trusted() or current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.completed_at is not null then
      perform public.reject_guarded_write('weekly_goals', 'completed_at');
    end if;

    -- The week is the user's own current week, decided here rather than accepted
    -- from the caller (Domain Rule 4). This is the invariant createWeeklyGoal
    -- relied on; enforcing it in the database is what makes it true over
    -- PostgREST as well as through the action.
    select p.timezone, p.week_start into v_zone, v_week
      from public.profiles p where p.id = new.user_id;
    -- A cross-user insert (new.user_id is not the caller's) cannot resolve the
    -- other account's profile under this trigger's invoker RLS, so v_zone is
    -- null. Fall through and let the row-level `with check` policy refuse it with
    -- 42501, rather than raising a different code here.
    if v_zone is null then
      return new;
    end if;

    -- The first day of the current local week, inlined from local_week_start()
    -- rather than called: this trigger runs as the invoking (authenticated) role,
    -- which is deliberately not granted execute on the internal helper. The
    -- arithmetic is identical (0 = Sunday, matching @momentum/core/time weekOf).
    v_this_week := (now() at time zone v_zone)::date
                 - ((extract(dow from (now() at time zone v_zone)::date)::integer - v_week + 7) % 7);
    if new.week_start is distinct from v_this_week then
      raise exception 'a weekly goal is set for the current week (%), not %', v_this_week, new.week_start
        using errcode = '22023',
              hint = 'The week is resolved from your profile; a goal filed under another week could be claimed against the wrong rows.';
    end if;

    return new;
  end if;

  -- UPDATE: the completion time is written only by claim_weekly_goal (trusted),
  -- and the award key must never move under an already-created goal.
  if new.completed_at is distinct from old.completed_at then
    perform public.reject_guarded_write('weekly_goals', 'completed_at');
  end if;
  if new.week_start is distinct from old.week_start
     or new.metric is distinct from old.metric
     or new.target is distinct from old.target
  then
    perform public.reject_guarded_write('weekly_goals', 'week_start/metric/target');
  end if;

  return new;
end;
$$;

comment on function public.guard_weekly_goals() is
  'Weekly goals are insertable only for the caller''s current local week; week_start/metric/target/completed_at are frozen afterwards. Closes the arbitrary-week farm (Domain Rules 6, 7).';

-- The trigger already fires BEFORE INSERT OR UPDATE (20260906130100_guard_inserts.sql).
