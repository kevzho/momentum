-- Momentum — security hardening: make the daily XP caps ungameable.
--
-- The audit (2026-09-09) confirmed two ways to defeat the per-source daily caps
-- (Domain Rule 6, §20), both against the live stack:
--
-- 1. TIMEZONE RESET (high). `cap_xp_event` measured "today" as the local date in
--    `profiles.timezone`, and that column is client-writable (only its guarded
--    xp/level/coins are frozen). By PATCHing the profile to a timezone whose
--    local midnight has just passed, every earlier award becomes "yesterday" and
--    the full cap reopens. There are ~35 distinct local-midnight instants across
--    the tz database in any 24h, so the window could be reset roughly hourly —
--    ~30x the intended cap for a scripted account, across tasks, habits and
--    focus alike.
--
-- 2. CHECK-THEN-INSERT RACE (medium). The BEFORE INSERT trigger read the
--    committed day-sum and trimmed the amount, but took no per-user lock; the
--    profile row lock came only in the AFTER trigger. Concurrent awards all read
--    an under-cap sum and all inserted in full, overshooting by (concurrency-1)
--    x award size.
--
-- The fix for both is one change to the window and one lock:
--
--   * The cap is now a ROLLING 24-HOUR window (`created_at > now() - 24h`)
--     instead of a calendar date in a mutable timezone. It depends on no client
--     setting, so it cannot be reset by changing the profile; and it is a
--     strictly-not-weaker anti-farm bound (a calendar day actually allowed 2x
--     across a midnight — the full cap at 23:59 and again at 00:01). This is a
--     deliberate change to the "capped per local day" wording of Domain Rule 6 /
--     §20; see docs/DOMAIN_RULES.md, updated in the same change with the reason.
--
--   * `cap_xp_event` takes `for update` on the caller's profile row before it
--     reads the sum, so concurrent awards for one user serialise and each sees
--     the previous one's committed row (READ COMMITTED re-reads after the lock).
--     The lock is per-user and XP awards are not a hot path, so this costs
--     nothing measurable.
--
-- Nothing about the amount changes, and the ledger stays the single mint. The
-- caps are unchanged numbers; only the window they are measured over moves.

create or replace function public.cap_xp_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cap   integer := public.xp_daily_cap(new.source_type);
  v_today integer;
begin
  if v_cap is null then
    return new;
  end if;

  -- Serialise awards for this user before reading the window, so two concurrent
  -- inserts cannot both pass an under-cap check. The AFTER-insert trigger takes
  -- this same row lock to move profiles.xp; taking it here, first, closes the
  -- check-then-insert race without changing what either trigger writes.
  perform 1 from public.profiles p where p.id = new.user_id for update;

  -- A rolling 24-hour window rather than a calendar date in profiles.timezone:
  -- the cap must not be resettable by a column the client can write. The window
  -- reads the ledger itself, so it can never drift from the awards it bounds.
  select coalesce(sum(e.amount), 0)
    into v_today
    from public.xp_events e
   where e.user_id = new.user_id
     and e.source_type = new.source_type
     and e.created_at > coalesce(new.created_at, now()) - interval '24 hours';

  new.amount := least(new.amount, greatest(0, v_cap - v_today));

  if new.amount <= 0 then
    -- Nothing is lost: the work is recorded on its own row, and the cap only
    -- ever bounds the reward (Domain Rules 3, 7).
    return null;
  end if;

  return new;
end;
$$;

comment on function public.cap_xp_event() is
  'Applies the per-source cap over a rolling 24h window (client-timezone-independent), under a per-user row lock so concurrent awards cannot both pass. Anti-farming is arithmetic, not a UI restriction (Domain Rule 6).';

-- ---------------------------------------------------------------------------
-- end_focus_session — same window, so its pre-check agrees with the trigger.
-- ---------------------------------------------------------------------------
--
-- The focus award computes its own remaining-cap inline before inserting the
-- ledger row (so it can skip a doomed insert). That copy used the same
-- timezone-local-day window and so had the same reset hole; it is brought onto
-- the rolling 24h window so it and `cap_xp_event` measure the same thing. The
-- ledger trigger is still the authority — this is only a fast path — but the two
-- must not disagree. Only the window changed; every other line is as shipped in
-- 20260907130000_focus_functions.sql.

create or replace function public.end_focus_session(p_id uuid, p_status public.focus_status)
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

  if v_row.status in ('completed', 'abandoned') then
    return v_row;
  end if;

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

  if v_minutes < public.xp_rule('focus_min_session_minutes') then
    return v_row;
  end if;

  v_base := v_minutes * public.xp_rule('focus_per_minute');

  if v_row.planned_minutes > 0 and v_minutes >= v_row.planned_minutes then
    v_base := v_base + floor(v_base * public.xp_rule('focus_planned_bonus_pct') / 100.0)::integer;
  end if;

  if v_task.priority = 1 then
    v_base := v_base + public.xp_rule('priority_bonus_p1');
  end if;

  v_base := least(v_base, public.xp_rule('focus_session_cap'));

  -- Rolling 24h window, matching cap_xp_event (see above). No client setting
  -- enters the bound.
  select coalesce(sum(e.amount), 0) into v_today
    from public.xp_events e
   where e.user_id = v_row.user_id
     and e.source_type = 'focus_session'
     and e.created_at > v_now - interval '24 hours';

  v_amount := least(v_base, greatest(0, public.xp_rule('focus_daily_cap') - v_today));

  if v_amount <= 0 then
    return v_row;
  end if;

  v_reason := case
                when v_task.id is not null then format('Focused %s minutes on "%s"', v_minutes, v_task.title)
                else format('Focused %s minutes', v_minutes)
              end;

  insert into public.xp_events (user_id, source_type, source_id, amount, reason)
  values (v_row.user_id, 'focus_session', v_row.id, v_amount, v_reason)
  on conflict do nothing;

  return v_row;
end;
$$;
