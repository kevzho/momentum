-- Momentum — enums and shared helpers.
--
-- Everything here is infrastructure the rest of the schema depends on:
-- the domain enums (mirrored by `as const` arrays in @momentum/core/types),
-- the housekeeping triggers, and the primitives that make Domain Rule 15
-- ("trusted writes go through database functions") enforceable.
--
-- Every function is `set search_path = ''` and fully qualifies its names, so it
-- behaves identically no matter which role or session invokes it.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.task_status as enum ('open', 'completed', 'archived');

create type public.block_kind as enum ('event', 'work', 'habit');

create type public.habit_frequency as enum (
  'daily',
  'weekdays',
  'times_per_week',
  'amount_per_day',
  'amount_per_week'
);

create type public.habit_unit as enum ('count', 'minutes');

create type public.focus_status as enum ('running', 'paused', 'completed', 'abandoned');

create type public.xp_source as enum (
  'task',
  'focus_session',
  'habit_completion',
  'quest',
  'weekly_goal',
  'achievement'
);

create type public.quest_period as enum ('daily', 'weekly');

create type public.quest_metric as enum (
  'tasks_completed',
  'priority_tasks_completed',
  'focus_minutes',
  'habits_completed',
  'habit_days',
  'blocks_completed'
);

create type public.cosmetic_kind as enum ('profile_frame', 'theme', 'block_style', 'avatar');

create type public.project_color as enum (
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'pink',
  'rose'
);

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with the database clock, never a client value.';

-- ---------------------------------------------------------------------------
-- Trusted-write flag (Domain Rule 15)
-- ---------------------------------------------------------------------------
--
-- The browser holds the user's own JWT and can call PostgREST directly, so any
-- column a policy lets the user write is client-writable. Guarded columns (XP,
-- level, coins, task status/actuals, block and goal completion) are therefore
-- protected by BEFORE UPDATE triggers that only yield to a transaction-local
-- flag. `security definer` functions set the flag; nothing else can, because
-- `set_config(..., true)` is transaction-scoped and PostgREST starts a fresh
-- transaction per request.

create function public.is_trusted()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('momentum.trusted', true), 'off') = 'on';
$$;

comment on function public.is_trusted() is
  'True inside a transaction that a trusted (security definer) function has marked. See docs/ARCHITECTURE.md §12.';

create function public.reject_guarded_write(p_table text, p_column text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is written only by trusted database logic (%.%)', p_column, 'public', p_table
    using errcode = '42501',
          hint = 'Call the database function that owns this column instead of updating it directly.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Timezone validation
-- ---------------------------------------------------------------------------

create function public.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_timezone is not null
     and exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_timezone);
$$;

comment on function public.is_valid_timezone(text) is
  'True when the string is a timezone Postgres recognises (the IANA database it ships with).';

create function public.validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_valid_timezone(new.timezone) then
    raise exception 'invalid timezone: %', new.timezone
      using errcode = '22023',
            hint = 'Use an IANA identifier such as America/New_York.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cross-table ownership
-- ---------------------------------------------------------------------------
--
-- An RLS policy proves the row's own user_id is the caller. It does not prove
-- that a foreign key points at a row the caller owns: without this trigger a
-- crafted request could attach a work block to another user's task. The
-- trigger takes (column, referenced table) pairs as arguments; every referenced
-- table has a user_id column, and every lookup is a primary-key hit.
--
-- It is `security definer` so the answer does not depend on the caller's own
-- policies: pointing at a row that does not exist and pointing at someone
-- else's row are the same refusal, which is also why it leaks nothing.

create function public.assert_same_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row        jsonb := to_jsonb(new);
  v_column     text;
  v_table      text;
  v_value      uuid;
  v_owner      uuid;
  i            integer;
begin
  if array_length(tg_argv, 1) is null or array_length(tg_argv, 1) % 2 <> 0 then
    raise exception 'assert_same_owner expects (column, table) pairs';
  end if;

  for i in 0 .. array_length(tg_argv, 1) / 2 - 1 loop
    v_column := tg_argv[i * 2];
    v_table := tg_argv[i * 2 + 1];
    v_value := nullif(v_row ->> v_column, '')::uuid;

    if v_value is not null then
      execute format('select t.user_id from public.%I t where t.id = $1', v_table)
        into v_owner
        using v_value;

      if v_owner is null or v_owner <> new.user_id then
        raise exception '%.% must reference a row owned by the same user', tg_table_name, v_column
          using errcode = '42501';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.assert_same_owner() is
  'BEFORE INSERT OR UPDATE trigger. Arguments are (column, referenced table) pairs; each non-null FK must point at a row with the same user_id.';
