-- Momentum — quest visibility: the quests a user holds stay visible across a
-- timezone change.
--
-- 20260909120300_security_quest_multiplication.sql made `assign_quests` refuse a
-- second same-kind set whose window overlaps one the user already holds, so a
-- user gets exactly one current daily set and one current weekly set whatever
-- timezone the profile names. `ensure_quest_assignments` still *returned* only
-- the set whose `period_start` equals today / this week's first day resolved in
-- the profile's current timezone. After a timezone change that moves the local
-- date, the held set has a different `period_start`, the guard (correctly)
-- creates no replacement, and the caller sees no quests for up to a day.
--
-- The return set now follows the same rule the guard applies: every assignment
-- of the caller whose window, evaluated in the timezone it was assigned in,
-- contains `now()`. The resolution of today/this week and both `assign_quests`
-- calls are unchanged, so no caller can choose the period.

create or replace function public.ensure_quest_assignments()
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

  -- The sets whose window contains now, each in the zone it was assigned in —
  -- the same windows `assign_quests` refuses to duplicate.
  return query
    select a.*
      from public.quest_assignments a
     where a.user_id = v_user
       and tstzrange(
             a.period_start::timestamp at time zone coalesce(a.timezone, v_zone),
             (a.period_start + case a.period when 'daily' then 1 else 7 end)::timestamp
               at time zone coalesce(a.timezone, v_zone)
           ) @> now()
     order by a.period, a.period_start, a.slot;
end;
$$;

comment on function public.ensure_quest_assignments() is
  'Assigns and returns the caller''s current quests: every assignment whose window, in the timezone it was assigned in, contains now. Deterministic per (account, date); takes no arguments, so no caller can choose the period.';
