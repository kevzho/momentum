-- Momentum — the focus session's trusted writes (Phase 7).
--
-- `focus_sessions` and `focus_pauses` are client-read-only: the grants in
-- `20260906121200_grants.sql` give `authenticated` `select` and nothing else,
-- so every row in both tables is written here (Domain Rule 15). This migration
-- is the sanctioned path, and it is what makes the timer worth trusting.
--
-- **Why the timer lives in the database.** A focus session is a measurement,
-- and a measurement whose endpoints the measured party supplies is not one. So
-- every timestamp on both tables is stamped with `now()` inside these bodies —
-- `started_at`, `paused_at`, `resumed_at`, `ended_at` — and the client never
-- sends a time. What the browser does with those timestamps is arithmetic for
-- display (`@momentum/core/focus`); what the ledger records is computed here,
-- from the same rows, with the database's own clock. A tab that was asleep, a
-- machine that was suspended and a clock that is four minutes fast all change
-- what the user *saw*, and none of them changes what is written.
--
-- The shape follows `20260906130000_calendar_functions.sql` and
-- `20260907120000_habit_functions.sql`: `security definer`, `set search_path =
-- ''`, `public.assert_caller()` before any write, the trusted flag held open
-- for exactly the guarded write and no longer, and the affected row returned so
-- a server action can hand it straight to the UI.
--
-- Four rules run through all of them.
--
-- **One live session at a time.** `focus_sessions_active_uniq` already says so;
-- `start_focus_session` says it first, with a message, so the second tab gets a
-- conflict it can explain rather than a constraint violation. This is also what
-- makes "overlapping concurrent sessions do not double-count" true by
-- construction rather than by arithmetic (specs/07-focus-mode.md).
--
-- **Every function is idempotent.** A retried call converges on the requested
-- state and returns the row; it never raises because the work was already done
-- (Domain Rule 17). For `finish_focus_session` that guarantee is the whole
-- anti-farming story on the retry side: a session that has already finished
-- returns unchanged, so its minutes reach the task once and its XP is minted
-- once, however many times the response is lost.
--
-- **XP is computed here and nowhere else** (Domain Rule 6). The client sends an
-- id; the server decides the amount, applies the minimum, the per-session cap
-- and what is left of the per-day cap, and writes one ledger row. The amount is
-- never an argument.
--
-- **Nothing is punitive** (Domain Rule 7). Ending a session early records the
-- time it measured and awards no XP; it does not remove anything, does not mark
-- the session as a failure, and the word "abandoned" is a status value, not a
-- string this product shows to a person.

-- ---------------------------------------------------------------------------
-- xp_rule
-- ---------------------------------------------------------------------------
--
-- The single home for the tunables, deferred by docs/DATABASE.md "with the
-- functions that use them". `finish_focus_session` is the first of those, so
-- the focus tunables arrive here; Phase 8 extends the same function with
-- `task_base`, `level_for_xp()` and the `apply_xp_event()` trigger that moves
-- `profiles.xp`, exactly as `complete_task` and `record_habit_completion` left
-- it. Until then the ledger is the record and the profile total is Phase 8's to
-- reconcile.
--
-- Changing one of these numbers is a migration *and* a one-line change to
-- `FOCUS_XP` in `packages/core/src/focus/xp.ts`, which is the same rule written
-- where it can be exhaustively tested without a database.
-- `packages/db/src/focus-rules.test.ts` reads this function as text and fails
-- if the two disagree, so the pair cannot drift apart unnoticed.
--
-- It raises on an unknown name rather than returning null. A null tunable would
-- silently make every award null, which is the one failure mode a table of
-- constants must not have.

-- `xp_rule_unknown` is defined first, and the order is load-bearing rather than
-- stylistic: `xp_rule` is `language sql`, so Postgres resolves its body when the
-- function is created (`check_function_bodies`), and a forward reference to a
-- function that does not exist yet fails the migration outright. A `plpgsql`
-- body would not have been checked this way, which is exactly why the mistake
-- is easy to make and impossible to see without applying the migration.
--
-- Split out at all because a `case` expression cannot raise. Internal to
-- `xp_rule`.

create function public.xp_rule_unknown(p_name text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  raise exception 'no XP rule named %', p_name
    using errcode = '22023',
          hint = 'Add the tunable to xp_rule() in a migration, and to FOCUS_XP in packages/core/src/focus/xp.ts.';
end;
$$;

create function public.xp_rule(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
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
           else (select public.xp_rule_unknown(p_name))
         end;
$$;

comment on function public.xp_rule(text) is
  'The XP tunables, in one place. Mirrored by FOCUS_XP in @momentum/core/focus and pinned to it by packages/db/src/focus-rules.test.ts.';

-- ---------------------------------------------------------------------------
-- focus_session_elapsed_minutes
-- ---------------------------------------------------------------------------
--
-- The measured length of a session, in whole minutes, excluding every paused
-- span. This is the one place the product's *actual* time is computed
-- (Domain Rule 3), and it is the same arithmetic
-- `packages/core/src/focus/timer.ts` performs for the display: wall time from
-- the start to the horizon, less the pauses clipped to that same interval.
--
-- Each pause is clipped rather than summed raw, so an open pause contributes
-- only up to the horizon and a row that somehow began before the session
-- contributes only its overlap. Truncated, not rounded: a session is credited
-- with the minutes it completed.
--
-- Internal; not granted. The horizon is always a value the caller stamped with
-- `now()` in the same transaction.

create function public.focus_session_elapsed_minutes(p_session_id uuid, p_horizon timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
           0,
           floor(
             extract(epoch from (
               greatest(p_horizon - s.started_at, interval '0')
               - coalesce((
                   select sum(
                            greatest(
                              least(coalesce(p.resumed_at, p_horizon), p_horizon)
                              - greatest(p.paused_at, s.started_at),
                              interval '0'
                            )
                          )
                     from public.focus_pauses p
                    where p.session_id = s.id
                 ), interval '0')
             )) / 60
           )
         )::integer
    from public.focus_sessions s
   where s.id = p_session_id;
$$;

comment on function public.focus_session_elapsed_minutes(uuid, timestamptz) is
  'Measured minutes of a session up to a horizon, excluding paused spans. The product''s actual time (Domain Rule 3).';

-- ---------------------------------------------------------------------------
-- start_focus_session
-- ---------------------------------------------------------------------------
--
-- `p_id` is client-generated (Domain Rule 17). It is what makes a retry after a
-- lost response idempotent: the second call finds its own row and returns it,
-- instead of colliding with the live session the first call created and
-- reporting a conflict for a session the user is already in.
--
-- The project is derived from the task when the caller does not name one, so
-- the history's per-project totals do not depend on the client remembering to
-- send it. Both foreign keys are `on delete set null`: the session outlives the
-- task it was attributed to, and a deleted project does not erase the time.

create function public.start_focus_session(
  p_planned_minutes integer,
  p_id              uuid default null,
  p_task_id         uuid default null,
  p_project_id      uuid default null
)
returns public.focus_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_task    public.tasks;
  v_project uuid := p_project_id;
  v_live    public.focus_sessions;
  v_row     public.focus_sessions;
begin
  if v_user is null then
    raise exception 'a focus session belongs to a signed-in account'
      using errcode = '42501';
  end if;

  -- The retry case, before anything else: this exact session already exists.
  if p_id is not null then
    select * into v_row from public.focus_sessions s where s.id = p_id;
    if found then
      perform public.assert_caller(v_row.user_id);
      return v_row;
    end if;
  end if;

  if p_task_id is not null then
    select * into v_task from public.tasks t where t.id = p_task_id;
    if not found then
      raise exception 'task % does not exist', p_task_id using errcode = 'P0002';
    end if;
    perform public.assert_caller(v_task.user_id);
    -- Named explicitly or inherited from the task, never invented.
    v_project := coalesce(p_project_id, v_task.project_id);
  end if;

  -- One live session per account (`focus_sessions_active_uniq`). Said here as
  -- well as in the index so the second tab is told what is already running
  -- rather than being handed a constraint name.
  select * into v_live
    from public.focus_sessions s
   where s.user_id = v_user
     and s.status in ('running', 'paused');

  if found then
    raise exception 'a focus session started at % is still running', v_live.started_at
      using errcode = '23505',
            hint = 'Finish or end the session that is already running before starting another.';
  end if;

  insert into public.focus_sessions (id, user_id, task_id, project_id, planned_minutes, started_at)
  values (coalesce(p_id, gen_random_uuid()), v_user, p_task_id, v_project, p_planned_minutes, now())
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.start_focus_session(integer, uuid, uuid, uuid) is
  'Starts the account''s one live session, stamped with the database clock. Idempotent on the client-generated id (Domain Rule 17).';

-- ---------------------------------------------------------------------------
-- pause_focus_session / resume_focus_session
-- ---------------------------------------------------------------------------
--
-- A pause is a row, not a subtraction. Recording the span is what lets the
-- elapsed time be *derived* on every read rather than accumulated — and what
-- lets a paused session be reloaded, or looked at an hour later, and still
-- report the time it had reached when it was paused.
--
-- Both are no-ops in the state they would produce, so a double-click or a
-- retried request settles rather than raises.

create function public.pause_focus_session(p_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.focus_sessions;
begin
  select * into v_row from public.focus_sessions s where s.id = p_id;
  if not found then
    raise exception 'focus session % does not exist', p_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_row.user_id);

  if v_row.status = 'paused' then
    return v_row;
  end if;

  if v_row.status <> 'running' then
    raise exception 'this session has already ended'
      using errcode = '22023';
  end if;

  -- `focus_pauses_open_uniq` allows one open pause per session; the status
  -- check above means there cannot already be one.
  insert into public.focus_pauses (session_id, user_id, paused_at)
  values (p_id, v_row.user_id, now());

  update public.focus_sessions s
     set status = 'paused'
   where s.id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create function public.resume_focus_session(p_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.focus_sessions;
begin
  select * into v_row from public.focus_sessions s where s.id = p_id;
  if not found then
    raise exception 'focus session % does not exist', p_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_row.user_id);

  if v_row.status = 'running' then
    return v_row;
  end if;

  if v_row.status <> 'paused' then
    raise exception 'this session has already ended'
      using errcode = '22023';
  end if;

  -- `now()` is the transaction's start time, so a pause and its resume are
  -- always in different transactions and `focus_pauses_order_chk`
  -- (`resumed_at > paused_at`) is satisfied by construction.
  update public.focus_pauses p
     set resumed_at = now()
   where p.session_id = p_id
     and p.resumed_at is null;

  update public.focus_sessions s
     set status = 'running'
   where s.id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.pause_focus_session(uuid) is
  'Opens a pause span and flips the session to paused. Idempotent.';
comment on function public.resume_focus_session(uuid) is
  'Closes the open pause span and flips the session back to running. Idempotent.';

-- ---------------------------------------------------------------------------
-- mark_interruption
-- ---------------------------------------------------------------------------
--
-- Only ever called because the user said so. Nothing in the product infers an
-- interruption from a blurred window or a switched tab: the app cannot see what
-- the user is doing, and a count it guessed at would be a number that looks
-- measured and is not (specs/07-focus-mode.md, Domain Rule 8's spirit).
--
-- It is a count, and it costs nothing. No XP is deducted (Domain Rule 7).

create function public.mark_interruption(p_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.focus_sessions;
begin
  select * into v_row from public.focus_sessions s where s.id = p_id;
  if not found then
    raise exception 'focus session % does not exist', p_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_row.user_id);

  if v_row.status not in ('running', 'paused') then
    raise exception 'this session has already ended'
      using errcode = '22023';
  end if;

  update public.focus_sessions s
     set interruption_count = s.interruption_count + 1
   where s.id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.mark_interruption(uuid) is
  'Increments the session''s interruption count. Only the user marks one; nothing is inferred and nothing is deducted.';

-- ---------------------------------------------------------------------------
-- end_focus_session — the shared body of finishing and ending early
-- ---------------------------------------------------------------------------
--
-- Both endings do the same three things and differ in one: they close any open
-- pause, compute the measured minutes and add them to the linked task. Only a
-- finished session awards XP.
--
-- **Ending early still credits the task.** docs/DATABASE.md described
-- `abandon_focus_session` as recording `actual_minutes` and no XP, without
-- saying whether the task's own total moved; it does, and this is where that is
-- decided. Twenty-five minutes of work are twenty-five minutes of work whether
-- or not the user let the bell ring, and Domain Rule 3 calls that number the
-- product's most valuable long-term signal — dropping it because a session
-- ended early would make every estimate-versus-actual comparison quietly
-- under-report, and would also make ending early feel like a punishment
-- (Domain Rule 7). The XP is what distinguishes the two, because XP is the
-- reward and the minutes are the measurement.
--
-- Internal; not granted. The two public endings below are thin wrappers, so
-- there is one implementation of "what a session leaves behind".

create function public.end_focus_session(p_id uuid, p_status public.focus_status)
returns public.focus_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      public.focus_sessions;
  v_now      timestamptz := now();
  v_minutes  integer;
  v_task     public.tasks;
  v_zone     text;
  v_today    integer;
  v_base     integer;
  v_amount   integer;
  v_reason   text;
begin
  select * into v_row from public.focus_sessions s where s.id = p_id;
  if not found then
    raise exception 'focus session % does not exist', p_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_row.user_id);

  -- The idempotency guarantee, and the whole of it: a session that has already
  -- ended returns exactly as it is. Its minutes reached the task once and its
  -- ledger row was written once, however many times this is called
  -- (Domain Rules 6, 17). The early return happens before the trusted flag is
  -- ever set, and before any clock is read.
  if v_row.status in ('completed', 'abandoned') then
    return v_row;
  end if;

  -- A session ended while paused: the pause runs to this instant and no
  -- further, so the paused minutes are excluded exactly once.
  update public.focus_pauses p
     set resumed_at = v_now
   where p.session_id = p_id
     and p.resumed_at is null
     and v_now > p.paused_at;

  v_minutes := public.focus_session_elapsed_minutes(p_id, v_now);

  update public.focus_sessions s
     set status         = p_status,
         ended_at       = v_now,
         actual_minutes = v_minutes
   where s.id = p_id
  returning * into v_row;

  -- The measurement reaches the task (Domain Rule 3). `tasks.actual_minutes` is
  -- a guarded column, so this is the one write in the body that needs the
  -- trusted flag, and the flag is opened and closed around exactly it.
  if v_row.task_id is not null and v_minutes > 0 then
    perform set_config('momentum.trusted', 'on', true);
    update public.tasks t
       set actual_minutes = t.actual_minutes + v_minutes
     where t.id = v_row.task_id
    returning * into v_task;
    perform set_config('momentum.trusted', 'off', true);
  elsif v_row.task_id is not null then
    select * into v_task from public.tasks t where t.id = v_row.task_id;
  end if;

  if p_status <> 'completed' then
    return v_row;
  end if;

  -- ---- XP (Domain Rule 6) -------------------------------------------------
  --
  -- Everything below is decided here, from rows this transaction just wrote.
  -- The client sent an id and nothing else.

  if v_minutes < public.xp_rule('focus_min_session_minutes') then
    return v_row;
  end if;

  v_base := v_minutes * public.xp_rule('focus_per_minute');

  -- Reaching the planned length, not stopping exactly on it: a session run past
  -- its own bell is still a session that was seen through.
  if v_row.planned_minutes > 0 and v_minutes >= v_row.planned_minutes then
    v_base := v_base + floor(v_base * public.xp_rule('focus_planned_bonus_pct') / 100.0)::integer;
  end if;

  if v_task.priority = 1 then
    v_base := v_base + public.xp_rule('priority_bonus_p1');
  end if;

  -- The per-session cap applies after the bonuses, or it would not be a cap.
  v_base := least(v_base, public.xp_rule('focus_session_cap'));

  -- What is left of the day, measured in the *user's* day (Domain Rule 4) over
  -- the ledger itself rather than over a counter that could drift from it.
  select p.timezone into v_zone from public.profiles p where p.id = v_row.user_id;

  select coalesce(sum(e.amount), 0) into v_today
    from public.xp_events e
   where e.user_id = v_row.user_id
     and e.source_type = 'focus_session'
     and (e.created_at at time zone v_zone)::date = (v_now at time zone v_zone)::date;

  v_amount := least(v_base, greatest(0, public.xp_rule('focus_daily_cap') - v_today));

  if v_amount <= 0 then
    return v_row;
  end if;

  v_reason := case
                when v_task.id is not null then format('Focused %s minutes on "%s"', v_minutes, v_task.title)
                else format('Focused %s minutes', v_minutes)
              end;

  -- `xp_events_source_uniq (user_id, source_type, source_id)` is the second
  -- line of defence behind the early return above: two finishes racing each
  -- other still mint one award (Domain Rule 6).
  insert into public.xp_events (user_id, source_type, source_id, amount, reason)
  values (v_row.user_id, 'focus_session', v_row.id, v_amount, v_reason)
  on conflict do nothing;

  return v_row;
end;
$$;

create function public.finish_focus_session(p_id uuid)
returns public.focus_sessions
language sql
security definer
set search_path = ''
as $$
  select public.end_focus_session(p_id, 'completed');
$$;

create function public.abandon_focus_session(p_id uuid)
returns public.focus_sessions
language sql
security definer
set search_path = ''
as $$
  select public.end_focus_session(p_id, 'abandoned');
$$;

comment on function public.finish_focus_session(uuid) is
  'Ends a session, records its measured minutes on the session and the task, and awards focus XP once, ever (Domain Rules 3, 6).';
comment on function public.abandon_focus_session(uuid) is
  'Ends a session early. The measured minutes are still recorded; no XP is awarded and none is removed (Domain Rules 3, 7).';

-- ---------------------------------------------------------------------------
-- Exposure
-- ---------------------------------------------------------------------------
--
-- `20260906121200_grants.sql` revoked execute on everything in `public` and on
-- future functions by default, so a function is reachable over HTTP only when
-- its own phase says so. `xp_rule`, `xp_rule_unknown`,
-- `focus_session_elapsed_minutes` and `end_focus_session` are internal to the
-- bodies above and are deliberately not among these — in particular
-- `end_focus_session` takes the status as an argument, which is a decision the
-- two wrappers make and a caller does not.

grant execute on function public.start_focus_session(integer, uuid, uuid, uuid) to authenticated;
grant execute on function public.pause_focus_session(uuid)                      to authenticated;
grant execute on function public.resume_focus_session(uuid)                     to authenticated;
grant execute on function public.mark_interruption(uuid)                        to authenticated;
grant execute on function public.finish_focus_session(uuid)                     to authenticated;
grant execute on function public.abandon_focus_session(uuid)                    to authenticated;
