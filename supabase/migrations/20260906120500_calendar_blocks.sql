-- Momentum — calendar_blocks.
--
-- One table with a `kind` discriminator holds every time-bound row on the
-- board: events, task work blocks and habit blocks. The product's one mechanic
-- is that all of them compete for the same week, so every consumer — the week
-- grid, overlap layout, capacity maths, Find Time, Today's timeline, analytics
-- — wants one range query, one index, one drag mutation and one policy.
-- Per-kind integrity that separate tables would give for free is recovered by
-- the check constraints below (docs/DATABASE.md § calendar_blocks).
--
-- Multi-block-per-task (Domain Rule 2) falls out of the foreign key living on
-- the block: N blocks reference 1 task.

create table public.calendar_blocks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  kind             public.block_kind not null,
  -- Blocks have no meaning without their parent, so both cascade.
  task_id          uuid references public.tasks (id) on delete cascade,
  habit_id         uuid references public.habits (id) on delete cascade,
  title            text not null default '',
  description      text,
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  all_day          boolean not null default false,
  color            public.project_color,
  completed_at     timestamptz,
  recurrence       jsonb,
  recurrence_until date,
  series_id        uuid references public.calendar_blocks (id) on delete cascade,
  occurrence_date  date,
  cancelled        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint blocks_span_chk check (
    end_at > start_at and end_at - start_at <= interval '7 days'
  ),
  -- A work block always has a task, a habit block always has a habit, an event
  -- has neither (Domain Rule 13).
  constraint blocks_kind_shape_chk check (
    (kind = 'work'  and task_id is not null and habit_id is null)
    or (kind = 'habit' and habit_id is not null and task_id is null)
    or (kind = 'event' and task_id is null and habit_id is null)
  ),
  -- Events carry their own title; work and habit blocks display their parent's.
  constraint blocks_event_title_chk check (kind <> 'event' or length(title) > 0),
  -- Only events recur, and only a series row carries the rule (Domain Rule 16).
  constraint blocks_recurrence_kind_chk check (
    recurrence is null or (kind = 'event' and series_id is null)
  ),
  -- An override row is exactly "a series plus the occurrence it replaces".
  constraint blocks_override_shape_chk check ((series_id is null) = (occurrence_date is null)),
  -- Only an override can cancel; a plain block is deleted instead.
  constraint blocks_cancelled_chk check (cancelled = false or series_id is not null),
  constraint blocks_until_chk check (recurrence is not null or recurrence_until is null),
  constraint blocks_no_self_series_chk check (series_id is distinct from id)
);

comment on table public.calendar_blocks is
  'Every time-bound row on the board. Occurrences of a recurring event are expanded at query time and are never materialised.';
comment on column public.calendar_blocks.completed_at is
  'Guarded: "this span was executed". Completing a work block does not complete its task (Domain Rule 13).';
comment on column public.calendar_blocks.recurrence is
  '{freq, interval, byWeekday, until, count, timezone} on series rows; null everywhere else.';
comment on column public.calendar_blocks.recurrence_until is
  'Mirror of recurrence->>until, maintained by trigger so the window query can filter series in SQL.';
comment on column public.calendar_blocks.occurrence_date is
  'Which occurrence this override replaces, as a date in the series timezone.';

-- The week/day window query (start_at < :end and end_at > :start), Today, Next Up.
create index blocks_user_start_idx on public.calendar_blocks (user_id, start_at);
-- Series that might have an occurrence inside a window.
create index blocks_series_idx on public.calendar_blocks (user_id, recurrence_until)
  where recurrence is not null;
-- One override per occurrence, and the lookup that applies overrides.
create unique index blocks_override_uniq on public.calendar_blocks (series_id, occurrence_date)
  where series_id is not null;
-- Coverage maths, "this task has no blocks", and the cascade.
create index blocks_task_idx on public.calendar_blocks (task_id);
-- Habit week generation, and the cascade.
create index blocks_habit_idx on public.calendar_blocks (habit_id);

create trigger blocks_set_updated_at
  before update on public.calendar_blocks
  for each row execute function public.set_updated_at();

create trigger blocks_same_owner
  before insert or update on public.calendar_blocks
  for each row execute function public.assert_same_owner(
    'task_id', 'tasks', 'habit_id', 'habits', 'series_id', 'calendar_blocks'
  );

-- Recurrence ------------------------------------------------------------------

create function public.validate_recurrence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r         jsonb := new.recurrence;
  v_day     jsonb;
  v_until   text;
begin
  if r is null then
    return new;
  end if;

  if jsonb_typeof(r) <> 'object' then
    raise exception 'recurrence must be an object' using errcode = '22023';
  end if;

  if coalesce(r ->> 'freq', '') not in ('daily', 'weekly') then
    raise exception 'recurrence.freq must be daily or weekly, got %', r ->> 'freq'
      using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(r -> 'interval'), 'missing') <> 'number'
     or (r ->> 'interval')::numeric < 1
     or (r ->> 'interval')::numeric <> floor((r ->> 'interval')::numeric)
  then
    raise exception 'recurrence.interval must be an integer >= 1' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(r -> 'byWeekday'), 'null') <> 'null' then
    if jsonb_typeof(r -> 'byWeekday') <> 'array' then
      raise exception 'recurrence.byWeekday must be an array or null' using errcode = '22023';
    end if;
    for v_day in select jsonb_array_elements(r -> 'byWeekday') loop
      if jsonb_typeof(v_day) <> 'number' or (v_day #>> '{}')::numeric not between 0 and 6 then
        raise exception 'recurrence.byWeekday entries must be weekdays 0..6' using errcode = '22023';
      end if;
    end loop;
  end if;

  v_until := nullif(r ->> 'until', '');
  if v_until is not null then
    if v_until !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'recurrence.until must be YYYY-MM-DD' using errcode = '22023';
    end if;
    perform v_until::date;
  end if;

  if nullif(r ->> 'count', '') is not null then
    if coalesce(jsonb_typeof(r -> 'count'), 'missing') <> 'number'
       or (r ->> 'count')::numeric < 1
       or (r ->> 'count')::numeric <> floor((r ->> 'count')::numeric)
    then
      raise exception 'recurrence.count must be an integer >= 1' using errcode = '22023';
    end if;
    if v_until is not null then
      raise exception 'recurrence carries either until or count, never both' using errcode = '22023';
    end if;
  end if;

  if not public.is_valid_timezone(r ->> 'timezone') then
    raise exception 'recurrence.timezone must be an IANA identifier, got %', r ->> 'timezone'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.validate_recurrence() is
  'Validates the constrained recurrence model (docs/ARCHITECTURE.md §11) before the row is stored.';

create function public.sync_recurrence_until()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Deliberately tolerant: a malformed `until` is reported by
  -- validate_recurrence(), which runs after this trigger (Postgres fires BEFORE
  -- triggers in name order), with a message that names the field.
  if new.recurrence is null then
    new.recurrence_until := null;
  elsif coalesce(new.recurrence ->> 'until', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    new.recurrence_until := (new.recurrence ->> 'until')::date;
  else
    new.recurrence_until := null;
  end if;

  return new;
end;
$$;

create trigger blocks_sync_recurrence_until
  before insert or update of recurrence on public.calendar_blocks
  for each row execute function public.sync_recurrence_until();

create trigger blocks_validate_recurrence
  before insert or update of recurrence on public.calendar_blocks
  for each row execute function public.validate_recurrence();

-- Guarded columns -------------------------------------------------------------

create function public.guard_blocks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted() then
    return new;
  end if;

  if new.completed_at is distinct from old.completed_at then
    perform public.reject_guarded_write('calendar_blocks', 'completed_at');
  end if;

  return new;
end;
$$;

create trigger blocks_guard
  before update on public.calendar_blocks
  for each row execute function public.guard_blocks();

alter table public.calendar_blocks enable row level security;

create policy "calendar_blocks: select own"
  on public.calendar_blocks for select to authenticated
  using (user_id = (select auth.uid()));

create policy "calendar_blocks: insert own"
  on public.calendar_blocks for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "calendar_blocks: update own"
  on public.calendar_blocks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "calendar_blocks: delete own"
  on public.calendar_blocks for delete to authenticated
  using (user_id = (select auth.uid()));
