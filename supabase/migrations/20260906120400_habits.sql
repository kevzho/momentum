-- Momentum — habits.
--
-- Habits do not use the recurrence model: their schedule is `active_days` plus
-- a weekly target, and "Add to week" writes real habit blocks for one week
-- (docs/ARCHITECTURE.md §11). Archiving preserves history; deleting does not.

create table public.habits (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  name                 text not null,
  description          text,
  frequency_type       public.habit_frequency not null,
  target               integer not null default 1,
  unit                 public.habit_unit not null default 'count',
  active_days          smallint[] not null default '{}',
  preferred_start_time time,
  estimated_minutes    integer,
  xp_reward            integer not null default 5,
  color                public.project_color,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint habits_name_chk        check (length(name) between 1 and 100),
  constraint habits_target_positive_chk check (target > 0),
  constraint habits_active_days_chk check (active_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint habits_estimate_chk    check (estimated_minutes is null
                                           or (estimated_minutes > 0 and estimated_minutes <= 720)),
  -- Anti-farm cap: a habit can never be worth more than a focused hour of work.
  constraint habits_xp_reward_chk   check (xp_reward between 0 and 50),
  -- A weekdays habit without days would never be due.
  constraint habits_weekdays_chk    check (frequency_type <> 'weekdays' or cardinality(active_days) > 0),
  -- Only amount habits carry a unit other than count.
  constraint habits_unit_chk        check (frequency_type in ('amount_per_day', 'amount_per_week')
                                           or unit = 'count'),
  -- daily and weekdays mean "once"; the target is not a user-facing number there.
  constraint habits_target_chk      check (frequency_type not in ('daily', 'weekdays') or target = 1)
);

comment on column public.habits.active_days is
  'Weekdays 0..6 (0 = Sunday), only meaningful for frequency_type = weekdays.';
comment on column public.habits.xp_reward is
  'Per-completion award, capped by constraint so no habit can be farmed (Domain Rule 7).';

create index habits_user_idx on public.habits (user_id, archived_at);

create trigger habits_set_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

alter table public.habits enable row level security;

create policy "habits: select own"
  on public.habits for select to authenticated
  using (user_id = (select auth.uid()));

create policy "habits: insert own"
  on public.habits for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "habits: update own"
  on public.habits for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "habits: delete own"
  on public.habits for delete to authenticated
  using (user_id = (select auth.uid()));
