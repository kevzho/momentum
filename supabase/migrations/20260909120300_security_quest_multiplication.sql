-- Momentum — security hardening: a user gets one set of quests per real period,
-- not one set per reachable timezone.
--
-- The audit (2026-09-09) confirmed, against the live stack, that changing the
-- client-writable `profiles.timezone` and `profiles.week_start` and re-calling
-- `ensure_quest_assignments` spawns extra assignments. A quest assignment's
-- identity is `(user, quest, period_start)`, and `period_start` is derived from
-- those two mutable settings: seven values of `week_start` yield seven different
-- `local_week_start` dates (14 weekly assignments instead of 2), and two or three
-- local dates are reachable via timezone at any instant (up to 9 daily instead of
-- 3). Every one of those windows contains "now", so the same completed work
-- satisfies all of them, and `claim_quest` pays each in full — roughly 4x the
-- intended quest XP and coins per week, uncapped.
--
-- The invariant that closes it: `ensure_quest_assignments` only ever assigns the
-- period whose window contains `now()`, so ANY period a caller can reach right
-- now (in any timezone) overlaps the one they already hold. Refusing to create a
-- second same-kind assignment set whose instant window overlaps an existing one
-- therefore leaves exactly one current daily set and one current weekly set,
-- while never blocking a genuinely new period (tomorrow's daily window is
-- adjacent to today's, next week's to this week's — disjoint, so still created).
--
-- The overlap check has to compare each existing assignment's window IN THE
-- TIMEZONE IT WAS ASSIGNED IN, or a later timezone change would move the stored
-- window out from under `now()` and defeat the check. So the assignment now
-- records the timezone that produced it.

-- ---------------------------------------------------------------------------
-- Remember the timezone each assignment's period was resolved in.
-- ---------------------------------------------------------------------------

alter table public.quest_assignments
  add column timezone text;

comment on column public.quest_assignments.timezone is
  'The profile timezone period_start was resolved in. Used to compare assignment windows so a later timezone change cannot spawn overlapping quest sets.';

-- Backfill existing rows from the profile so the overlap check has a window for
-- them. Historical rows are for past periods and will not overlap a new one, but
-- giving them a concrete zone keeps the comparison exact.
update public.quest_assignments qa
   set timezone = p.timezone
  from public.profiles p
 where p.id = qa.user_id
   and qa.timezone is null;

-- ---------------------------------------------------------------------------
-- assign_quests — same rotation, now idempotent per real period.
-- ---------------------------------------------------------------------------
--
-- Only two things change from 20260907140000_gamification_functions.sql: the
-- early overlap check, and storing the timezone on insert. The slot rotation is
-- byte-for-byte the same, so gamification-rules.test.ts's determinism claim is
-- unaffected.

create or replace function public.assign_quests(
  p_user_id      uuid,
  p_period       public.quest_period,
  p_period_start date
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_slots     integer;
  v_count     integer;
  v_start     integer;
  v_len       integer := case p_period when 'daily' then 1 else 7 end;
  v_zone      text;
  v_win_start timestamptz;
  v_win_end   timestamptz;
begin
  select p.timezone into v_zone from public.profiles p where p.id = p_user_id;
  if v_zone is null then
    v_zone := 'UTC';
  end if;

  v_win_start := p_period_start::timestamp at time zone v_zone;
  v_win_end   := (p_period_start + v_len)::timestamp at time zone v_zone;

  -- One set per real period. A same-kind assignment whose window (in the zone it
  -- was assigned in) overlaps the one being requested means the caller already
  -- holds this period under a different timezone/week-start; do nothing. A
  -- genuinely later period is disjoint and falls through to be created.
  if exists (
    select 1
      from public.quest_assignments a
     where a.user_id = p_user_id
       and a.period = p_period
       and a.period_start <> p_period_start
       and tstzrange(
             a.period_start::timestamp at time zone coalesce(a.timezone, v_zone),
             (a.period_start + v_len)::timestamp at time zone coalesce(a.timezone, v_zone)
           ) && tstzrange(v_win_start, v_win_end)
  ) then
    return;
  end if;

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
  insert into public.quest_assignments (id, user_id, quest_id, period, period_start, slot, timezone)
  select public.quest_assignment_id(p_user_id, o.id, p_period_start),
         p_user_id, o.id, p_period, p_period_start, s.slot, v_zone
    from generate_series(0, v_slots - 1) as s(slot)
    join ordered o on o.idx = ((v_start + s.slot) % v_count)
  on conflict do nothing;
end;
$$;

comment on function public.assign_quests(uuid, public.quest_period, date) is
  'Assigns a period''s quests, skipping any period whose window overlaps one the user already holds (in that assignment''s own timezone). One current set per kind, whatever timezone/week-start the caller sweeps (Domain Rule 6).';
