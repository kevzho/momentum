-- Momentum — progression: XP, levels, coins, quests, achievements, cosmetics
-- (Phase 8).
--
-- This migration closes the loop every earlier phase deliberately left open.
-- `complete_task`, `record_habit_completion` and `finish_focus_session` already
-- decide *what happened*; until now nothing turned that into a total, because
-- a total is only as meaningful as the curve that reads it and the curve is
-- this phase's to finalise (docs/DATABASE.md, "Functions (trusted logic)").
--
-- Four things run through all of it.
--
-- **The client never sends an amount** (Domain Rule 6). Every function here
-- takes ids and nothing else. The amount is computed from `xp_rule()` and from
-- rows the database wrote itself, inside the transaction that caused the award.
-- There is no argument anywhere below that a caller could inflate.
--
-- **Every award is minted at most once, ever** (Domain Rule 6). The ledger's
-- `xp_events_source_uniq (user_id, source_type, source_id)` is the mechanism,
-- and the *choice of `source_id`* is what makes it work across a delete: a
-- weekly goal's award is keyed on `(user, week, metric)` rather than on the row
-- id, so deleting the goal and creating it again collides with its own earlier
-- award instead of minting a second one. The same reasoning as
-- `habit_completion_id` (Phase 6), applied to every source that a client can
-- destroy and recreate.
--
-- **Nothing is ever withdrawn** (Domain Rule 7). The ledger is append-only.
-- Un-completing a task leaves its XP alone, an unclaimed quest costs nothing,
-- and there is no code path in this file that lowers `profiles.xp` — the only
-- statement that touches it adds.
--
-- **Anti-farming is arithmetic, not a UI restriction** (Domain Rule 6). Daily
-- caps live in a `before insert` trigger on the ledger, so they apply to every
-- source and cannot be forgotten by a function added later.
--
-- One deliberate asymmetry: `finish_focus_session` (Phase 7) still computes and
-- inserts its own award rather than calling `award_xp()` below. Its rule is
-- pinned to `@momentum/core/focus` by reading that migration as text
-- (`packages/db/src/focus-rules.test.ts`), it already applies the same
-- discipline inline, and replacing a working, tested body for symmetry is the
-- kind of churn `CLAUDE.md` forbids. What unifies the sources is the ledger and
-- its two triggers, which every insert passes through — including that one.

-- ---------------------------------------------------------------------------
-- xp_rule — the tunables, extended
-- ---------------------------------------------------------------------------
--
-- Phase 7 shipped this function with the six focus tunables and said Phase 8
-- would add the rest "in the same `case`". This is that. The six focus numbers
-- are reproduced exactly; changing one of them is still a migration *and* a
-- one-line change to `FOCUS_XP` in `packages/core/src/focus/xp.ts`, and
-- `packages/db/src/focus-rules.test.ts` reads *this* file too, so the pin
-- survives the replacement.
--
-- The new numbers are pinned the same way to `TASK_XP`, `QUEST_XP` and
-- `LEVEL_CURVE` in `@momentum/core/gamification`
-- (`packages/db/src/gamification-rules.test.ts`).
--
-- It still raises on an unknown name. A tunable that silently returned null
-- would make every award that reads it null, which is the one failure mode a
-- table of constants must not have.

create or replace function public.xp_rule(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
           -- ---- Focus (Phase 7; unchanged) --------------------------------
           -- Roughly a point a focused minute (specs/07-focus-mode.md).
           when 'focus_per_minute'          then 1
           -- Below this a session earns nothing at all, so starting and
           -- abandoning trivial sessions is never profitable.
           when 'focus_min_session_minutes' then 5
           -- The most one session can earn, bonuses included.
           when 'focus_session_cap'         then 120
           -- The most one local day can earn from focus, however many sessions.
           when 'focus_daily_cap'           then 300
           -- For reaching the length you planned.
           when 'focus_planned_bonus_pct'   then 10
           -- A small bonus for a session on a P1 task.
           when 'priority_bonus_p1'         then 5

           -- ---- Tasks (Phase 8) -------------------------------------------
           -- "~10 base XP" (specs/08-gamification.md).
           when 'task_base'                 then 10
           -- What makes a project task "significant": an estimate at or above
           -- two hours. The estimate is the user's own declaration of size
           -- (Domain Rule 3), and it is the only size signal a task carries at
           -- the moment it is completed.
           when 'task_significant_minutes'  then 120
           when 'task_significant_bonus'    then 10
           -- The most one local day can earn from completing tasks. Twenty
           -- ordinary tasks; far above a real day, and far below what a script
           -- that creates and completes rows in a loop would mint.
           when 'task_daily_cap'            then 200
           -- The same idea for habits, which are otherwise bounded only by how
           -- many habits an account chooses to create.
           when 'habit_daily_cap'           then 100

           -- ---- Goals and achievements (Phase 8) ---------------------------
           -- A weekly goal is the user's own promise, so the reward is flat:
           -- an amount derived from the target would pay for setting a bigger
           -- number rather than for doing more.
           when 'weekly_goal_base'          then 50
           when 'weekly_goal_coins'         then 20
           when 'achievement_base'          then 40

           -- ---- Achievement thresholds (Phase 8) --------------------------
           -- Named here rather than written into evaluate_achievements() so the
           -- conditions the product advertises and the numbers it checks are
           -- the same numbers, and so a test can read them.
           when 'deep_work_minutes'         then 90
           when 'consistency_weeks'         then 5
           when 'early_bird_blocks'         then 10
           when 'early_bird_before_hour'    then 12
           when 'planner_tasks'             then 5

           -- ---- Level curve (Phase 8) --------------------------------------
           -- Cumulative XP to reach level L is `base * (L - 1) ^ (exponent%)`.
           -- See docs/ARCHITECTURE.md §16 for the reasoning and the first
           -- thirty thresholds.
           when 'level_curve_base'          then 100
           when 'level_curve_exponent_pct'  then 150

           -- ---- Quest rotation (Phase 8) -----------------------------------
           -- How many quests a user is assigned per period. Three daily is
           -- inside the spec's "3–4"; a fourth would make the day's list read
           -- as a checklist to clear rather than a few small goals.
           when 'daily_quest_slots'         then 3
           when 'weekly_quest_slots'        then 2

           else (select public.xp_rule_unknown(p_name))
         end;
$$;

comment on function public.xp_rule(text) is
  'The XP tunables, in one place. Mirrored by FOCUS_XP in @momentum/core/focus and by @momentum/core/gamification, and pinned to both by packages/db.';

-- ---------------------------------------------------------------------------
-- The level curve
-- ---------------------------------------------------------------------------
--
--   cumulative XP to reach level L = floor(100 * (L - 1) ^ 1.5)
--
-- Chosen because its *per-level* cost grows linearly with the square root of
-- the level rather than geometrically: level 2 costs 100, level 10 costs 300,
-- level 40 costs about 940. A user who has been at this for months still levels
-- up occasionally, which is the pacing specs/08-gamification.md asks for and
-- the thing an exponential curve destroys. docs/ARCHITECTURE.md §16 carries the
-- table of the first thirty thresholds.
--
-- `level_for_xp` is the inverse, and it does not trust floating point to decide
-- a level: it starts from the analytic answer and then walks to the level the
-- *thresholds* agree with. A user one XP short of level 12 must never be shown
-- level 12 because `power()` returned 11.000000001.

create function public.xp_for_level(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
           when p_level <= 1 then 0
           else floor(
                  public.xp_rule('level_curve_base')
                  * power((p_level - 1)::numeric,
                          public.xp_rule('level_curve_exponent_pct')::numeric / 100)
                )::integer
         end;
$$;

create function public.level_for_xp(p_xp integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_level integer;
begin
  if p_xp is null or p_xp <= 0 then
    return 1;
  end if;

  v_level := greatest(
    1,
    floor(
      power(p_xp::numeric / public.xp_rule('level_curve_base'),
            100::numeric / public.xp_rule('level_curve_exponent_pct'))
    )::integer + 1
  );

  -- Correct in both directions, so the answer is the one the thresholds state.
  while v_level > 1 and p_xp < public.xp_for_level(v_level) loop
    v_level := v_level - 1;
  end loop;
  while p_xp >= public.xp_for_level(v_level + 1) loop
    v_level := v_level + 1;
  end loop;

  return v_level;
end;
$$;

comment on function public.xp_for_level(integer) is
  'Cumulative XP required to reach a level: floor(100 * (L - 1) ^ 1.5). Mirrored by xpForLevel in @momentum/core/gamification.';
comment on function public.level_for_xp(integer) is
  'The level a total buys. Corrected against xp_for_level so floating point never decides a level.';

-- ---------------------------------------------------------------------------
-- The ledger's two triggers
-- ---------------------------------------------------------------------------
--
-- Together they are what makes "the profile total reconciles with the ledger"
-- true by construction rather than by a job that runs later.
--
-- `cap_xp_event` (before insert) applies the per-source daily cap, in the
-- user's own day (Domain Rule 4), measured over the ledger itself rather than
-- over a counter that could drift from it. Putting the cap here rather than in
-- each awarding function is deliberate: a source added by a later phase is
-- capped by default, and the anti-farming rule cannot be forgotten at a call
-- site. An award trimmed to nothing is dropped rather than inserted as a zero,
-- because `xp_events_amount_chk` says a ledger row is worth something.
--
-- `apply_xp_event` (after insert) moves `profiles.xp` and recomputes the level.
-- `profiles.xp` and `profiles.level` are guarded columns, so it opens the
-- trusted flag around exactly that update and restores whatever the calling
-- function had set — the awarding bodies below hold the flag open for their own
-- writes, and a trigger that reset it to 'off' would sabotage its caller.

create function public.xp_daily_cap(p_source public.xp_source)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_source
           -- Deferred to the focus tunable so the two can never disagree.
           when 'focus_session'    then public.xp_rule('focus_daily_cap')
           when 'task'             then public.xp_rule('task_daily_cap')
           when 'habit_completion' then public.xp_rule('habit_daily_cap')
           -- Uncapped because the *definitions* already bound them: three daily
           -- and two weekly quest assignments, one weekly goal per metric per
           -- week, and an achievement that unlocks once ever.
           else null
         end;
$$;

create function public.cap_xp_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cap   integer := public.xp_daily_cap(new.source_type);
  v_zone  text;
  v_today integer;
begin
  if v_cap is null then
    return new;
  end if;

  select p.timezone into v_zone from public.profiles p where p.id = new.user_id;
  if v_zone is null then
    v_zone := 'UTC';
  end if;

  select coalesce(sum(e.amount), 0)
    into v_today
    from public.xp_events e
   where e.user_id = new.user_id
     and e.source_type = new.source_type
     and (e.created_at at time zone v_zone)::date
         = (coalesce(new.created_at, now()) at time zone v_zone)::date;

  new.amount := least(new.amount, greatest(0, v_cap - v_today));

  if new.amount <= 0 then
    -- Nothing is lost: the work is recorded on its own row, and the cap only
    -- ever bounds the reward (Domain Rules 3, 7).
    return null;
  end if;

  return new;
end;
$$;

create trigger xp_events_cap
  before insert on public.xp_events
  for each row execute function public.cap_xp_event();

create function public.apply_xp_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_previous text := coalesce(current_setting('momentum.trusted', true), 'off');
begin
  perform set_config('momentum.trusted', 'on', true);

  update public.profiles p
     set xp    = p.xp + new.amount,
         level = public.level_for_xp(p.xp + new.amount)
   where p.id = new.user_id;

  perform set_config('momentum.trusted', v_previous, true);
  return null;
end;
$$;

create trigger xp_events_apply
  after insert on public.xp_events
  for each row execute function public.apply_xp_event();

comment on function public.cap_xp_event() is
  'Applies the per-source daily cap in the user''s own day, over the ledger. Anti-farming is arithmetic, not a UI restriction (Domain Rule 6).';
comment on function public.apply_xp_event() is
  'Adds an award to profiles.xp and recomputes the level. The only statement in the product that moves either column.';

-- ---------------------------------------------------------------------------
-- award_xp / award_coins
-- ---------------------------------------------------------------------------
--
-- `award_xp` returns the amount that actually reached the ledger: 0 when the
-- award had already been minted for this `(user, source, source_id)`, and 0
-- when the day's cap left no room. Callers use that to decide whether a
-- *coin* reward is due, which is what makes coins idempotent for free — the
-- ledger's uniqueness is the only lock either reward needs.
--
-- A null `source_id` is refused. `xp_events_source_uniq` is a partial index
-- over `source_id is not null`, so an award without one would have no
-- idempotency at all, and every source in this product has a natural key.

create function public.award_xp(
  p_user_id   uuid,
  p_source    public.xp_source,
  p_source_id uuid,
  p_amount    integer,
  p_reason    text
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_awarded integer;
begin
  if p_source_id is null then
    raise exception 'an XP award needs a source id; without one the ledger cannot make it idempotent'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  insert into public.xp_events (user_id, source_type, source_id, amount, reason)
  values (p_user_id, p_source, p_source_id, p_amount, p_reason)
  on conflict do nothing
  returning amount into v_awarded;

  return coalesce(v_awarded, 0);
end;
$$;

create function public.award_coins(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_previous text := coalesce(current_setting('momentum.trusted', true), 'off');
  v_coins    integer;
begin
  if p_amount is null or p_amount <= 0 then
    select p.coins into v_coins from public.profiles p where p.id = p_user_id;
    return coalesce(v_coins, 0);
  end if;

  perform set_config('momentum.trusted', 'on', true);

  update public.profiles p
     set coins = p.coins + p_amount
   where p.id = p_user_id
  returning p.coins into v_coins;

  perform set_config('momentum.trusted', v_previous, true);
  return v_coins;
end;
$$;

comment on function public.award_xp(uuid, public.xp_source, uuid, integer, text) is
  'Writes one ledger row and returns what actually landed: 0 when the award was already minted or the day''s cap was full.';
comment on function public.award_coins(uuid, integer) is
  'Adds coins to a profile. Never subtracts; spending goes through purchase_cosmetic().';

-- ---------------------------------------------------------------------------
-- reconcile_xp
-- ---------------------------------------------------------------------------
--
-- Recomputes the profile total from the ledger and the level from the total.
-- For audits and tests; the application never calls it, and it is not granted.
-- If it ever changes a row, the triggers above have a bug — which is exactly
-- what the database suite asserts it does not.

create function public.reconcile_xp(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous text := coalesce(current_setting('momentum.trusted', true), 'off');
  v_total    integer;
  v_row      public.profiles;
begin
  select coalesce(sum(e.amount), 0) into v_total
    from public.xp_events e
   where e.user_id = p_user_id;

  perform set_config('momentum.trusted', 'on', true);

  update public.profiles p
     set xp    = v_total,
         level = public.level_for_xp(v_total)
   where p.id = p_user_id
  returning * into v_row;

  perform set_config('momentum.trusted', v_previous, true);
  return v_row;
end;
$$;

comment on function public.reconcile_xp(uuid) is
  'Recomputes profiles.xp from the ledger and the level from it. Audits and tests only; never granted, never called by the UI.';

-- ---------------------------------------------------------------------------
-- local_week_start
-- ---------------------------------------------------------------------------
--
-- The first day of the week a date falls in, in the user's own week shape
-- (Domain Rule 4: Monday or Sunday is a preference, never a constant).
-- `extract(dow)` is 0 = Sunday, which is the same convention `Weekday` uses in
-- `@momentum/core/types`, so the arithmetic below is `weekOf()` written in SQL.

create function public.local_week_start(p_date date, p_week_start smallint)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date - ((extract(dow from p_date)::integer - p_week_start + 7) % 7);
$$;

-- ---------------------------------------------------------------------------
-- complete_task — now with its award
-- ---------------------------------------------------------------------------
--
-- Phase 3 shipped the state transition and said the XP award and the
-- achievement evaluation would arrive with the phase that owns them. This is
-- that phase, and — exactly as that migration predicted — no caller changes:
-- the server actions, the repositories and the UI all still call this name with
-- these arguments.
--
-- **Idempotency is structural, not procedural.** The award is keyed on the
-- task's own id, so completing, un-completing and re-completing collides with
-- the first award on `xp_events_source_uniq` and mints nothing. The early
-- return for an already-completed task is the fast path; the ledger's index is
-- the guarantee, and the database suite proves it by inserting the award
-- directly and watching the second attempt do nothing.
--
-- The amount: a base, plus a small bonus for a P1 task, plus a bonus for a
-- "significant project task" — one that belongs to a project and that the user
-- estimated at two hours or more. The estimate is the only size signal a task
-- carries (Domain Rule 3), and reading the *estimate* rather than the measured
-- time is deliberate: the reward is for finishing the thing the user said was
-- big, not for having taken a long time over it.

create or replace function public.complete_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task   public.tasks;
  v_amount integer;
begin
  select * into v_task from public.tasks t where t.id = p_task_id;
  if not found then
    raise exception 'task % does not exist', p_task_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_task.user_id);

  -- Idempotent, and deliberately without re-stamping: a retried mutation must
  -- not move a completion time the user already earned, and `updated_at` should
  -- not churn for a call that changed nothing. Returning here also returns
  -- before the trusted flag is ever set.
  if v_task.status = 'completed' then
    return v_task;
  end if;

  perform set_config('momentum.trusted', 'on', true);

  -- `tasks_status_completed_chk` is `(status = 'completed') = (completed_at is
  -- not null)`, so the two columns can only ever move together, in one update.
  update public.tasks t
     set status = 'completed',
         completed_at = now()
   where t.id = p_task_id
  returning * into v_task;

  perform set_config('momentum.trusted', 'off', true);

  -- ---- XP (Domain Rule 6) -------------------------------------------------
  -- Decided here, from the row this transaction just wrote. The caller sent an
  -- id.
  v_amount := public.xp_rule('task_base');

  if v_task.priority = 1 then
    v_amount := v_amount + public.xp_rule('priority_bonus_p1');
  end if;

  if v_task.project_id is not null
     and coalesce(v_task.estimated_minutes, 0) >= public.xp_rule('task_significant_minutes')
  then
    v_amount := v_amount + public.xp_rule('task_significant_bonus');
  end if;

  perform public.award_xp(
    v_task.user_id, 'task', v_task.id, v_amount,
    format('Completed "%s"', v_task.title)
  );

  -- Completing a task never touches its blocks (Domain Rule 13). Incomplete
  -- future blocks stay on the calendar and render as settled; nothing here
  -- deletes or completes them, and un-completing restores the task with those
  -- blocks exactly as they were.
  return v_task;
end;
$$;

comment on function public.complete_task(uuid) is
  'Completes a task and awards its XP once, ever (Domain Rule 6). Idempotent. Never touches the task''s blocks (Domain Rule 13).';

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------
--
-- Six conditions, evaluated against the caller's own rows. Every one is a fact
-- about work that happened; none of them can be reached by asking, which is why
-- there is no "unlock" argument anywhere in this file.
--
-- `evaluate_achievements` is cheap in the case that runs on almost every write:
-- it selects only the definitions the user has *not* unlocked, and does nothing
-- at all once all six are earned. It is called by the triggers below rather
-- than by each awarding function, so a phase that adds a new way to complete
-- work does not have to remember to call it.
--
-- The conditions match the descriptions the user reads, because those rows are
-- the product's promise. `20260906121100_definitions.sql` seeded four of them
-- with wordings that predate this phase's conditions; the updates at the end of
-- this file bring the text and the check back into agreement.

create function public.habit_week_met(p_habit_id uuid, p_week_start date)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_habit    public.habits;
  v_achieved integer := 0;
  v_target   integer := 0;
  v_per_day  integer;
  v_amount   integer;
  v_date     date;
  v_offset   integer;
begin
  select * into v_habit from public.habits h where h.id = p_habit_id;
  if not found then
    return false;
  end if;

  -- Per-week cadence: the week's contributions against the habit's own target.
  -- A boolean habit contributes one per *day* whatever the row says, which is
  -- `contributionOf` in @momentum/core/habits.
  if v_habit.frequency_type in ('times_per_week', 'amount_per_week') then
    select coalesce(sum(
             case when v_habit.frequency_type = 'amount_per_week' then c.amount else 1 end
           ), 0)
      into v_achieved
      from public.habit_completions c
     where c.habit_id = p_habit_id
       and c.completion_date >= p_week_start
       and c.completion_date < p_week_start + 7
       and c.amount > 0;

    return v_achieved >= v_habit.target;
  end if;

  -- Per-day cadence: every day the habit asks for, at the amount it asks for.
  v_per_day := case when v_habit.frequency_type = 'amount_per_day' then v_habit.target else 1 end;

  for v_offset in 0..6 loop
    v_date := p_week_start + v_offset;

    if v_habit.frequency_type = 'weekdays'
       and not (extract(dow from v_date)::smallint = any (v_habit.active_days))
    then
      continue;
    end if;

    v_target := v_target + v_per_day;

    select least(coalesce(c.amount, 0), v_per_day)
      into v_amount
      from public.habit_completions c
     where c.habit_id = p_habit_id
       and c.completion_date = v_date;

    v_achieved := v_achieved + coalesce(v_amount, 0);
  end loop;

  return v_target > 0 and v_achieved >= v_target;
end;
$$;

comment on function public.habit_week_met(uuid, date) is
  'True when a habit reached its target across one week. The SQL twin of weekProgress() in @momentum/core/habits.';

create function public.achievement_earned(p_user_id uuid, p_key text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zone       text;
  v_week_start smallint;
  v_count      integer;
  v_habit      record;
  v_weeks      integer;
  v_week       record;
begin
  select p.timezone, p.week_start into v_zone, v_week_start
    from public.profiles p where p.id = p_user_id;
  if v_zone is null then
    return false;
  end if;

  case p_key
    when 'first_step' then
      return exists (
        select 1 from public.tasks t
         where t.user_id = p_user_id and t.status = 'completed'
      );

    when 'deep_work' then
      return exists (
        select 1 from public.focus_sessions s
         where s.user_id = p_user_id
           and s.status = 'completed'
           and coalesce(s.actual_minutes, 0) >= public.xp_rule('deep_work_minutes')
      );

    when 'consistency' then
      -- Weeks, not a streak: five weeks in which a habit reached its target,
      -- consecutive or not (Domain Rule 7). Only weeks the habit recorded
      -- something in are examined, so the scan is bounded by the data.
      for v_habit in
        select h.id from public.habits h where h.user_id = p_user_id
      loop
        v_weeks := 0;
        for v_week in
          select distinct public.local_week_start(c.completion_date, v_week_start) as week_start
            from public.habit_completions c
           where c.habit_id = v_habit.id
        loop
          if public.habit_week_met(v_habit.id, v_week.week_start) then
            v_weeks := v_weeks + 1;
            if v_weeks >= public.xp_rule('consistency_weeks') then
              return true;
            end if;
          end if;
        end loop;
      end loop;
      return false;

    when 'early_bird' then
      select count(*) into v_count
        from public.calendar_blocks b
       where b.user_id = p_user_id
         and b.completed_at is not null
         and (b.start_at at time zone v_zone)::time
             < make_time(public.xp_rule('early_bird_before_hour'), 0, 0);
      return v_count >= public.xp_rule('early_bird_blocks');

    when 'planner' then
      -- "Ahead of time" is a fact the row carries: the block was created before
      -- the span it reserves. A block dropped onto a slot that has already
      -- passed is scheduling, not planning.
      select count(distinct b.task_id) into v_count
        from public.calendar_blocks b
       where b.user_id = p_user_id
         and b.kind = 'work'
         and b.task_id is not null
         and b.start_at > b.created_at;
      return v_count >= public.xp_rule('planner_tasks');

    when 'project_finisher' then
      return exists (
        select 1
          from public.projects pr
         where pr.user_id = p_user_id
           and exists (select 1 from public.tasks t
                        where t.project_id = pr.id and t.status = 'completed')
           and not exists (select 1 from public.tasks t
                            where t.project_id = pr.id and t.status = 'open')
      );

    else
      return false;
  end case;
end;
$$;

comment on function public.achievement_earned(uuid, text) is
  'Whether one achievement''s condition holds for a user. The condition and the description the user reads are kept in agreement deliberately.';

create function public.evaluate_achievements(
  p_user_id uuid default null,
  p_keys    text[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := coalesce(p_user_id, (select auth.uid()));
  v_unlocked integer := 0;
  v_def      record;
begin
  -- The caller may only ever evaluate their own account, whether they called it
  -- directly or a trigger did on their behalf.
  perform public.assert_caller(v_user);

  -- `p_keys` narrows the sweep to the achievements the write could actually
  -- have made true. It is an optimisation with teeth: `consistency` walks every
  -- habit and every week it recorded something in, and re-running that on every
  -- task update — which is what a trigger without a column list would do — puts
  -- that scan behind a drag-reorder of a task list. A null means "all six", for
  -- a caller that has no reason to narrow.
  for v_def in
    select d.id, d.key, d.name
      from public.achievement_definitions d
     where (p_keys is null or d.key = any (p_keys))
       and not exists (
             select 1 from public.user_achievements ua
              where ua.user_id = v_user and ua.achievement_id = d.id
           )
     order by d.sort_order
  loop
    if public.achievement_earned(v_user, v_def.key) then
      insert into public.user_achievements (user_id, achievement_id)
      values (v_user, v_def.id)
      on conflict do nothing;

      if found then
        v_unlocked := v_unlocked + 1;
        -- Keyed on the definition, so an achievement pays once however many
        -- times this runs (Domain Rule 6).
        perform public.award_xp(
          v_user, 'achievement', v_def.id, public.xp_rule('achievement_base'),
          format('Unlocked "%s"', v_def.name)
        );
      end if;
    end if;
  end loop;

  return v_unlocked;
end;
$$;

comment on function public.evaluate_achievements(uuid, text[]) is
  'Unlocks whichever of the caller''s achievements have become true, and awards each once, ever. Cheap once all six are earned.';

-- ---------------------------------------------------------------------------
-- The triggers that call it
-- ---------------------------------------------------------------------------
--
-- The four tables an achievement can become true from, watched directly rather
-- than through the ledger. Watching `xp_events` instead would have been fewer
-- triggers and would have had a hole in it: a habit whose reward is zero, or a
-- ninety-minute session finished after the day's focus cap was full, both do
-- real work and mint no ledger row, and neither would ever have been noticed.
--
-- Statement-level with transition tables: planning a week inserts twenty blocks
-- in one statement, and an evaluation per row would run the same six queries
-- twenty times for one gesture.
--
-- Each fires only for a signed-in caller acting on their own rows. A write with
-- no `auth.uid()` — the seed, a migration, a maintenance script run as the
-- service role — evaluates nothing, because an achievement belongs to the
-- person who did the work and a fixture is not that person. It is also what
-- keeps `supabase/seed.sql` deciding its own demo state rather than having six
-- conditions re-decided underneath it on every statement.
--
-- One transition table name (`inserted`) for one function, reused by all four
-- triggers; every one of those tables has a `user_id`.

-- `security definer` because of one caller: a client inserts its own calendar
-- blocks directly, so this trigger runs as `authenticated` on that path — and
-- `evaluate_achievements` is deliberately not granted to `authenticated`
-- (nothing outside the database has a reason to ask for an evaluation). Running
-- the trigger as the owner is what lets the ungranted function stay ungranted.
-- `auth.uid()` still reads the request's JWT claims, so "the caller" is
-- unchanged by the role the body runs under.

create function public.evaluate_achievements_touched()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_keys text[] := case tg_table_name
                     when 'tasks'             then array['first_step', 'project_finisher']
                     when 'calendar_blocks'   then array['planner', 'early_bird']
                     when 'focus_sessions'    then array['deep_work']
                     when 'habit_completions' then array['consistency']
                   end;
begin
  if v_user is null or v_keys is null then
    return null;
  end if;

  if exists (select 1 from inserted r where r.user_id = v_user) then
    perform public.evaluate_achievements(v_user, v_keys);
  end if;

  return null;
end;
$$;

comment on function public.evaluate_achievements_touched() is
  'Statement trigger: re-evaluates the caller''s achievements after a write that could have earned one.';

-- **No column lists**, and not by choice: Postgres refuses a transition table on
-- a trigger that has one (`0A000: transition tables cannot be specified for
-- triggers with column lists`). The narrowing that `after update of status`
-- would have expressed therefore moves inside the function, as the `p_keys`
-- argument above — which is a better place for it anyway, because it narrows
-- the *work* rather than merely the firing: a task update now checks two
-- conditions instead of six, and never the one that walks a habit's history.

-- First step, Project finisher.
create trigger tasks_evaluate_achievements
  after update on public.tasks
  referencing new table as inserted
  for each statement execute function public.evaluate_achievements_touched();

-- Planner (a block booked ahead of itself), Early bird (one completed before
-- noon). Two triggers rather than one `insert or update`, for the second half of
-- the same restriction: a transition table is refused on a trigger with more
-- than one event, too. Both call the same function, which reads the table it
-- fired for rather than the event.
create trigger blocks_evaluate_achievements_insert
  after insert on public.calendar_blocks
  referencing new table as inserted
  for each statement execute function public.evaluate_achievements_touched();

create trigger blocks_evaluate_achievements_update
  after update on public.calendar_blocks
  referencing new table as inserted
  for each statement execute function public.evaluate_achievements_touched();

-- Deep work.
create trigger focus_evaluate_achievements
  after update on public.focus_sessions
  referencing new table as inserted
  for each statement execute function public.evaluate_achievements_touched();

-- Consistency. An amount habit reaches its week's target by *updating* the day's
-- row, so both events matter here as well.
create trigger habit_completions_evaluate_achievements_insert
  after insert on public.habit_completions
  referencing new table as inserted
  for each statement execute function public.evaluate_achievements_touched();

create trigger habit_completions_evaluate_achievements_update
  after update on public.habit_completions
  referencing new table as inserted
  for each statement execute function public.evaluate_achievements_touched();

-- ---------------------------------------------------------------------------
-- metric_progress — what a quest or a goal is measuring
-- ---------------------------------------------------------------------------
--
-- One implementation for both, over a half-open window of *local dates* that
-- the caller resolved in the user's timezone (Domain Rule 4). Progress is never
-- stored: it is recomputed from `tasks`, `focus_sessions`, `habit_completions`
-- and `calendar_blocks` every time it is asked for, so it cannot drift from the
-- work it summarises, and un-completing something a quest counted lowers the
-- count rather than leaving a stale total behind.
--
-- `focus_minutes` counts every measured minute an *ended* session recorded,
-- including one the user ended early. That matches `focusedMinutes` in
-- `@momentum/core/focus`, and it is the non-punitive reading: the minutes
-- happened (Domain Rules 3, 7). Only the XP differs between the two endings.

create function public.metric_progress(
  p_user_id uuid,
  p_metric  public.quest_metric,
  p_from    date,
  p_to      date
)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zone  text;
  v_from  timestamptz;
  v_to    timestamptz;
  v_value integer;
begin
  select p.timezone into v_zone from public.profiles p where p.id = p_user_id;
  if v_zone is null then
    return 0;
  end if;

  v_from := p_from::timestamp at time zone v_zone;
  v_to   := p_to::timestamp at time zone v_zone;

  case p_metric
    when 'tasks_completed' then
      select count(*) into v_value
        from public.tasks t
       where t.user_id = p_user_id
         and t.status = 'completed'
         and t.completed_at >= v_from and t.completed_at < v_to;

    when 'priority_tasks_completed' then
      select count(*) into v_value
        from public.tasks t
       where t.user_id = p_user_id
         and t.status = 'completed'
         and t.priority = 1
         and t.completed_at >= v_from and t.completed_at < v_to;

    when 'focus_minutes' then
      select coalesce(sum(s.actual_minutes), 0) into v_value
        from public.focus_sessions s
       where s.user_id = p_user_id
         and s.status in ('completed', 'abandoned')
         and s.started_at >= v_from and s.started_at < v_to;

    when 'habits_completed' then
      select count(*) into v_value
        from public.habit_completions c
       where c.user_id = p_user_id
         and c.completion_date >= p_from and c.completion_date < p_to;

    when 'habit_days' then
      select count(distinct c.completion_date) into v_value
        from public.habit_completions c
       where c.user_id = p_user_id
         and c.completion_date >= p_from and c.completion_date < p_to;

    when 'blocks_completed' then
      select count(*) into v_value
        from public.calendar_blocks b
       where b.user_id = p_user_id
         and b.completed_at >= v_from and b.completed_at < v_to;
  end case;

  return coalesce(v_value, 0);
end;
$$;

comment on function public.metric_progress(uuid, public.quest_metric, date, date) is
  'A quest or goal metric over a half-open window of local dates. Progress is derived, never stored.';

-- ---------------------------------------------------------------------------
-- Quest assignment
-- ---------------------------------------------------------------------------
--
-- **The same user and the same date always produce the same quests**, and no
-- argument decides which: `ensure_quest_assignments()` takes none, and resolves
-- today and the week's first day from the profile's own timezone and week-start
-- preference. A caller cannot ask for a future day's quests, or for a hundred
-- past days of them.
--
-- The selection is a rotation, not a hash:
--
--   index = (days since 1970 + a per-account offset) mod n
--
-- taking the next `slots` definitions in key order, wrapping. docs/DATABASE.md
-- sketched `order by md5(user_id || period_start || key)`, and this replaces it
-- for one concrete reason: `@momentum/core/gamification` owns quest selection
-- for display (docs/ARCHITECTURE.md §2) and specs/08-gamification.md requires a
-- unit test of the determinism, so the rule has to be expressible in TypeScript
-- that runs in a browser without shipping an md5 implementation to it. A
-- rotation is four lines in both languages, is exactly as deterministic, and
-- rotates the set day to day instead of holding one user on one arbitrary
-- ordering for ever. `packages/db/src/gamification-rules.test.ts` pins the two
-- copies together.
--
-- The account offset is the last four hex digits of the user's uuid. It is a
-- spread, not a secret: two accounts starting on the same day should not be
-- handed the same three quests, and nothing else depends on it.

create function public.quest_rotation_offset(p_user_id uuid)
returns integer
language sql
immutable
set search_path = ''
as $$
  select ('x' || lpad(right(replace(p_user_id::text, '-', ''), 4), 8, '0'))::bit(32)::integer;
$$;

-- The identity of "this quest, for this user, in this period" — the same
-- reasoning as `habit_completion_id`: an id that is a function of the fact
-- rather than of the attempt that wrote it, so the XP award behind it is
-- idempotent even if the row were ever removed and re-created.
create function public.quest_assignment_id(p_user_id uuid, p_quest_id uuid, p_period_start date)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select md5(p_user_id::text || ':' || p_quest_id::text || ':' || p_period_start::text)::uuid;
$$;

create function public.assign_quests(
  p_user_id      uuid,
  p_period       public.quest_period,
  p_period_start date
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_slots integer;
  v_count integer;
  v_start integer;
begin
  v_slots := case p_period
               when 'daily' then public.xp_rule('daily_quest_slots')
               else public.xp_rule('weekly_quest_slots')
             end;

  select count(*) into v_count
    from public.quest_definitions d
   where d.active and d.period = p_period;

  if v_count = 0 then
    return;
  end if;

  v_slots := least(v_slots, v_count);
  v_start := (((p_period_start - date '1970-01-01') + public.quest_rotation_offset(p_user_id))
              % v_count + v_count) % v_count;

  with ordered as (
    select d.id, (row_number() over (order by d.key) - 1)::integer as idx
      from public.quest_definitions d
     where d.active and d.period = p_period
  )
  insert into public.quest_assignments (id, user_id, quest_id, period, period_start, slot)
  select public.quest_assignment_id(p_user_id, o.id, p_period_start),
         p_user_id, o.id, p_period, p_period_start, s.slot
    from generate_series(0, v_slots - 1) as s(slot)
    join ordered o on o.idx = ((v_start + s.slot) % v_count)
  on conflict do nothing;
end;
$$;

create function public.ensure_quest_assignments()
returns setof public.quest_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_zone  text;
  v_week  smallint;
  v_today date;
  v_start date;
begin
  if v_user is null then
    raise exception 'quests belong to a signed-in account' using errcode = '42501';
  end if;

  select p.timezone, p.week_start into v_zone, v_week
    from public.profiles p where p.id = v_user;
  if v_zone is null then
    raise exception 'profile % does not exist', v_user using errcode = 'P0002';
  end if;

  -- The user's own day and the user's own week (Domain Rule 4), decided here
  -- rather than accepted from the caller.
  v_today := (now() at time zone v_zone)::date;
  v_start := public.local_week_start(v_today, v_week);

  perform public.assign_quests(v_user, 'daily', v_today);
  perform public.assign_quests(v_user, 'weekly', v_start);

  return query
    select a.*
      from public.quest_assignments a
     where a.user_id = v_user
       and ((a.period = 'daily' and a.period_start = v_today)
         or (a.period = 'weekly' and a.period_start = v_start))
     order by a.period, a.slot;
end;
$$;

comment on function public.ensure_quest_assignments() is
  'Assigns and returns the caller''s quests for today and this week. Deterministic per (account, date); takes no arguments, so no caller can choose the period.';

create function public.quest_progress(p_assignment_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row   public.quest_assignments;
  v_def   public.quest_definitions;
begin
  select * into v_row from public.quest_assignments a where a.id = p_assignment_id;
  if not found then
    raise exception 'quest assignment % does not exist', p_assignment_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_row.user_id);

  select * into v_def from public.quest_definitions d where d.id = v_row.quest_id;

  return public.metric_progress(
    v_row.user_id,
    v_def.metric,
    v_row.period_start,
    v_row.period_start + case v_row.period when 'daily' then 1 else 7 end
  );
end;
$$;

comment on function public.quest_progress(uuid) is
  'Recomputes one assignment''s metric over its own period, in the profile timezone.';

-- ---------------------------------------------------------------------------
-- claim_quest
-- ---------------------------------------------------------------------------
--
-- The client asks to claim; the server checks the work. `p_assignment_id` is
-- the whole payload — there is no amount, no progress and no target in the
-- arguments, and the reward comes from the definition row, which only a
-- migration can write.
--
-- Idempotent twice over: an already-claimed assignment returns before anything
-- is written, and the coin credit is gated on the *ledger* accepting the XP
-- row, so even a claim that somehow reached the reward twice pays coins once.

create function public.claim_quest(p_assignment_id uuid)
returns public.quest_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      public.quest_assignments;
  v_def      public.quest_definitions;
  v_progress integer;
  v_awarded  integer;
begin
  select * into v_row from public.quest_assignments a where a.id = p_assignment_id;
  if not found then
    raise exception 'quest assignment % does not exist', p_assignment_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_row.user_id);

  if v_row.completed_at is not null then
    return v_row;
  end if;

  select * into v_def from public.quest_definitions d where d.id = v_row.quest_id;

  v_progress := public.metric_progress(
    v_row.user_id,
    v_def.metric,
    v_row.period_start,
    v_row.period_start + case v_row.period when 'daily' then 1 else 7 end
  );

  if v_progress < v_def.target then
    raise exception 'that quest is not finished yet'
      using errcode = '22023',
            hint = 'Progress is recomputed from your own work; nothing here can be claimed early.';
  end if;

  update public.quest_assignments a
     set completed_at = now()
   where a.id = p_assignment_id
  returning * into v_row;

  v_awarded := public.award_xp(
    v_row.user_id, 'quest', v_row.id, v_def.xp_reward,
    format('Quest: %s', v_def.title)
  );

  -- Coins ride on the ledger's decision, so the two rewards are minted together
  -- or not at all.
  if v_awarded > 0 then
    perform public.award_coins(v_row.user_id, v_def.coin_reward);
  end if;

  return v_row;
end;
$$;

comment on function public.claim_quest(uuid) is
  'Verifies a quest''s progress from the source rows, then awards its XP and coins once (Domain Rule 6).';

-- ---------------------------------------------------------------------------
-- Weekly goals
-- ---------------------------------------------------------------------------
--
-- A weekly goal is the one claimable thing in the product the *user* creates,
-- so its award needs an idempotency key the user cannot destroy. The row id
-- will not do: `weekly_goals` is fully client-writable, and delete-then-recreate
-- would mint a fresh award every time. The key is therefore the goal's natural
-- one — `(user, week, metric)` — which `weekly_goals_uniq` already declares to
-- be its identity.
--
-- The reward is flat rather than derived from the target, because an amount
-- that scaled with the target would pay for typing a bigger number.

create function public.weekly_goal_award_id(
  p_user_id    uuid,
  p_week_start date,
  p_metric     public.quest_metric
)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select md5(p_user_id::text || ':' || p_week_start::text || ':' || p_metric::text)::uuid;
$$;

create function public.weekly_goal_progress(p_goal_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.weekly_goals;
begin
  select * into v_row from public.weekly_goals g where g.id = p_goal_id;
  if not found then
    raise exception 'weekly goal % does not exist', p_goal_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_row.user_id);

  return public.metric_progress(v_row.user_id, v_row.metric, v_row.week_start, v_row.week_start + 7);
end;
$$;

create function public.claim_weekly_goal(p_goal_id uuid)
returns public.weekly_goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      public.weekly_goals;
  v_progress integer;
  v_awarded  integer;
  v_previous text;
begin
  select * into v_row from public.weekly_goals g where g.id = p_goal_id;
  if not found then
    raise exception 'weekly goal % does not exist', p_goal_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_row.user_id);

  if v_row.completed_at is not null then
    return v_row;
  end if;

  v_progress := public.metric_progress(v_row.user_id, v_row.metric, v_row.week_start, v_row.week_start + 7);

  if v_progress < v_row.target then
    raise exception 'that goal is not finished yet'
      using errcode = '22023',
            hint = 'Progress is recomputed from your own work; nothing here can be claimed early.';
  end if;

  v_previous := coalesce(current_setting('momentum.trusted', true), 'off');
  perform set_config('momentum.trusted', 'on', true);

  update public.weekly_goals g
     set completed_at = now()
   where g.id = p_goal_id
  returning * into v_row;

  perform set_config('momentum.trusted', v_previous, true);

  v_awarded := public.award_xp(
    v_row.user_id, 'weekly_goal',
    public.weekly_goal_award_id(v_row.user_id, v_row.week_start, v_row.metric),
    public.xp_rule('weekly_goal_base'),
    coalesce(nullif(v_row.title, ''), 'Weekly goal') || ' — done'
  );

  if v_awarded > 0 then
    perform public.award_coins(v_row.user_id, public.xp_rule('weekly_goal_coins'));
  end if;

  return v_row;
end;
$$;

comment on function public.claim_weekly_goal(uuid) is
  'Verifies a weekly goal from the source rows and awards it once per (account, week, metric) — a key a delete cannot reset.';

-- ---------------------------------------------------------------------------
-- Cosmetics
-- ---------------------------------------------------------------------------
--
-- Coins buy appearance and nothing else. There is no function in this file that
-- sells time, capacity, XP, a quest skip or any other advantage, and
-- `cosmetic_definitions` has no column that could describe one.
--
-- `available` is new. The shop may only sell a cosmetic the product actually
-- renders, and Phase 8 implements one collection — profile frames — as
-- specs/08-gamification.md asks. The other three kinds keep their definition
-- rows, so the architecture is exercised end to end, and are marked unavailable
-- until the phase that draws them arrives. A shop that took coins for something
-- invisible would be the worst possible version of this feature.

alter table public.cosmetic_definitions
  add column available boolean not null default true;

comment on column public.cosmetic_definitions.available is
  'Whether the shop may sell it. False until the product actually renders that cosmetic.';

create function public.purchase_cosmetic(p_cosmetic_id uuid)
returns public.user_cosmetics
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_def      public.cosmetic_definitions;
  v_row      public.user_cosmetics;
  v_coins    integer;
  v_previous text;
begin
  if v_user is null then
    raise exception 'a purchase belongs to a signed-in account' using errcode = '42501';
  end if;

  select * into v_def from public.cosmetic_definitions c where c.id = p_cosmetic_id;
  if not found then
    raise exception 'cosmetic % does not exist', p_cosmetic_id using errcode = 'P0002';
  end if;

  -- Already owned: return it, so a retried purchase after a lost response
  -- cannot be charged twice (Domain Rule 17).
  select * into v_row
    from public.user_cosmetics uc
   where uc.user_id = v_user and uc.cosmetic_id = p_cosmetic_id;
  if found then
    return v_row;
  end if;

  if not v_def.available then
    raise exception '"%" is not for sale yet', v_def.name using errcode = '22023';
  end if;

  select p.coins into v_coins from public.profiles p where p.id = v_user for update;

  if v_coins < v_def.price then
    raise exception 'that costs % coins and you have %', v_def.price, v_coins
      using errcode = '22023',
            hint = 'Coins come from finishing quests and weekly goals.';
  end if;

  v_previous := coalesce(current_setting('momentum.trusted', true), 'off');
  perform set_config('momentum.trusted', 'on', true);

  update public.profiles p
     set coins = p.coins - v_def.price
   where p.id = v_user;

  insert into public.user_cosmetics (user_id, cosmetic_id)
  values (v_user, p_cosmetic_id)
  returning * into v_row;

  perform set_config('momentum.trusted', v_previous, true);

  return v_row;
end;
$$;

comment on function public.purchase_cosmetic(uuid) is
  'Debits coins and grants a cosmetic, atomically. Cosmetics only: nothing here sells functionality (specs/08-gamification.md).';

-- ---------------------------------------------------------------------------
-- Reference data: the conditions the product checks and the text it shows
-- ---------------------------------------------------------------------------
--
-- `20260906121100_definitions.sql` seeded the six starters in Phase 2, before
-- anything evaluated them, and four of the descriptions describe a different
-- condition from the one specs/08-gamification.md names. The spec's table is
-- the contract for this phase, and a description that disagrees with the check
-- behind it is a promise the product breaks — so the text moves to the spec's
-- conditions rather than the conditions moving to the text.
--
-- "Consistency" is stated as five weeks that reached the target, **not five
-- consecutive weeks**: the count is of weeks met, in any order, and a week that
-- went badly subtracts nothing (Domain Rule 7).

update public.achievement_definitions set description =
  'Complete your first task.'
 where key = 'first_step';
update public.achievement_definitions set description =
  'Finish a focus session of 90 minutes or more.'
 where key = 'deep_work';
update public.achievement_definitions set description =
  'Reach a habit''s target in five weeks — they do not have to be in a row.'
 where key = 'consistency';
update public.achievement_definitions set description =
  'Complete ten scheduled blocks before noon.'
 where key = 'early_bird';
update public.achievement_definitions set description =
  'Schedule five different tasks ahead of the time they are booked for.'
 where key = 'planner';
update public.achievement_definitions set description =
  'Complete every remaining task in a project.'
 where key = 'project_finisher';

-- Only the collection this phase actually renders is for sale.
update public.cosmetic_definitions
   set available = (kind = 'profile_frame');

-- ---------------------------------------------------------------------------
-- Every quest metric is bounded
-- ---------------------------------------------------------------------------
--
-- Phase 2's volume check bounded five (period, metric) pairs and ended in
-- `else true`, which left seven of the twelve unbounded — a weekly
-- `blocks_completed` quest for 400 blocks would have been accepted by the
-- schema. Domain Rule 7 says quests never encourage unhealthy volumes of work,
-- and a rule with a hole in it is a rule a later migration falls through. Every
-- pair is now named, and the fallback is `false`: a metric added to the enum
-- without a decision about how much of it is too much cannot be seeded at all.
--
-- The five original bounds are unchanged. The seven new ones are set where a
-- committed, healthy day or week sits, not where an exceptional one does.

alter table public.quest_definitions
  drop constraint quest_definitions_volume_chk;

alter table public.quest_definitions
  add constraint quest_definitions_volume_chk check (
    case
      when period = 'daily'  and metric = 'tasks_completed'          then target <= 5
      when period = 'daily'  and metric = 'priority_tasks_completed' then target <= 3
      when period = 'daily'  and metric = 'focus_minutes'            then target <= 120
      when period = 'daily'  and metric = 'habits_completed'         then target <= 5
      when period = 'daily'  and metric = 'habit_days'               then target <= 1
      when period = 'daily'  and metric = 'blocks_completed'         then target <= 6
      when period = 'weekly' and metric = 'tasks_completed'          then target <= 25
      when period = 'weekly' and metric = 'priority_tasks_completed' then target <= 10
      when period = 'weekly' and metric = 'focus_minutes'            then target <= 360
      when period = 'weekly' and metric = 'habits_completed'         then target <= 35
      when period = 'weekly' and metric = 'habit_days'               then target <= 7
      when period = 'weekly' and metric = 'blocks_completed'         then target <= 30
      else false
    end
  );

-- ---------------------------------------------------------------------------
-- Exposure
-- ---------------------------------------------------------------------------
--
-- `20260906121200_grants.sql` revoked execute on everything in `public` and on
-- future functions by default, so a function is reachable over HTTP only when
-- its own phase says so. Six are, and every one of them takes ids only.
--
-- Deliberately not granted, and worth saying why for each group:
--
--   award_xp · award_coins · cap_xp_event · apply_xp_event · reconcile_xp
--     The mint. Publishing any of them would hand the client the amount, which
--     is the one thing Domain Rule 6 exists to prevent.
--   xp_for_level · level_for_xp · xp_daily_cap · local_week_start
--     Pure arithmetic the client already has in @momentum/core; an endpoint for
--     it would be a round trip to compute something in the wrong place.
--   metric_progress · achievement_earned · habit_week_met · assign_quests
--     Internals of the six below, and each takes a `user_id` argument that the
--     public functions supply from the row rather than from the caller.
--   quest_rotation_offset · quest_assignment_id · weekly_goal_award_id
--     Naming schemes for rows the caller already owns.
--   evaluate_achievements
--     Called by the four statement triggers, which is every path that can make
--     one true. Nothing outside the database has a reason to ask.

-- ---------------------------------------------------------------------------
-- The revoke that `alter default privileges` did not perform
-- ---------------------------------------------------------------------------
--
-- **This is a fix, and it matters more than anything else in this file.**
--
-- `20260906121200_grants.sql` closed the function surface with
--
--     revoke execute on all functions in schema public from public, anon, authenticated;
--     alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
--
-- The first statement worked, on the functions that existed at the time. The
-- second did not do what it reads like: the first live application of these
-- migrations showed every function created afterwards — Phase 6's, Phase 7's and
-- this file's — carrying the built-in `PUBLIC EXECUTE` grant, and therefore
-- reachable over PostgREST by any signed-in account. `public.assert_caller` is
-- the one exception, and only because `20260906130100_guard_inserts.sql`
-- revoked it by name.
--
-- What that meant concretely: `award_xp`, `award_coins`, `reconcile_xp`,
-- `evaluate_achievements` and `end_focus_session` were callable by the browser.
-- `award_xp(user, source, source_id, amount, reason)` takes the amount as an
-- argument. Domain Rule 6 — "the client never sends an XP amount" — was false in
-- the database while being true in every line of application code above it.
--
-- So the matrix is stated the way `20260906130100_guard_inserts.sql` states it:
-- explicitly, by name, for every function, and then re-granted. An explicit
-- revoke is observably honoured; a default-privileges revoke is not, and a
-- security boundary may not rest on the difference.
--
-- The loop is scoped to functions this schema owns (there are no extension
-- functions in `public`; Supabase keeps its own in `extensions`), so it cannot
-- reach past the application's own surface.

do $$
declare
  v_function text;
begin
  for v_function in
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (
             select 1 from pg_depend d
              where d.objid = p.oid and d.deptype = 'e'
           )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_function);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Re-granting the whole sanctioned surface
-- ---------------------------------------------------------------------------
--
-- Every phase's grants, restated here in one place because the revoke above
-- removed them all. This list *is* the exposure matrix in
-- `docs/DATABASE.md`, and `packages/db/tests/gamification.test.ts` asserts that
-- the database agrees with it exactly — no more and no fewer.

-- Phase 2: the three helpers the `security invoker` guard triggers call as the
-- signed-in role.
grant execute on function public.is_trusted()                     to authenticated;
grant execute on function public.is_valid_timezone(text)          to authenticated;
grant execute on function public.reject_guarded_write(text, text) to authenticated;

-- Phase 3: block and task completion.
grant execute on function public.complete_block(uuid, boolean)   to authenticated;
grant execute on function public.uncomplete_block(uuid, boolean) to authenticated;
grant execute on function public.complete_task(uuid)             to authenticated;
grant execute on function public.uncomplete_task(uuid)           to authenticated;

-- Phase 6: habits.
grant execute on function public.record_habit_completion(uuid, date, integer, uuid) to authenticated;
grant execute on function public.remove_habit_completion(uuid, date)                to authenticated;
grant execute on function public.complete_habit_block(uuid)                         to authenticated;
grant execute on function public.uncomplete_habit_block(uuid)                       to authenticated;

-- Phase 7: the focus lifecycle.
grant execute on function public.start_focus_session(integer, uuid, uuid, uuid) to authenticated;
grant execute on function public.pause_focus_session(uuid)                      to authenticated;
grant execute on function public.resume_focus_session(uuid)                     to authenticated;
grant execute on function public.mark_interruption(uuid)                        to authenticated;
grant execute on function public.finish_focus_session(uuid)                     to authenticated;
grant execute on function public.abandon_focus_session(uuid)                    to authenticated;

-- Phase 8: progression.
grant execute on function public.ensure_quest_assignments()      to authenticated;
grant execute on function public.quest_progress(uuid)            to authenticated;
grant execute on function public.claim_quest(uuid)               to authenticated;
grant execute on function public.weekly_goal_progress(uuid)      to authenticated;
grant execute on function public.claim_weekly_goal(uuid)         to authenticated;
grant execute on function public.purchase_cosmetic(uuid)         to authenticated;

-- The audit surface. `service_role` is the key an operator or a test harness
-- holds, never a browser: it already bypasses row-level security, so granting
-- it the reconciliation and curve helpers adds no reach a client could use, and
-- it is what lets `packages/db/tests/gamification.test.ts` assert that
-- `reconcile_xp()` changes nothing — which is the only way to prove the ledger's
-- triggers keep the total right rather than merely claiming they do.

grant execute on function public.reconcile_xp(uuid)              to service_role;
grant execute on function public.xp_for_level(integer)           to service_role;
grant execute on function public.level_for_xp(integer)           to service_role;
grant execute on function public.local_week_start(date, smallint) to service_role;
