-- Momentum — achievements, quests, weekly goals and cosmetics.
--
-- Definition tables are global reference data: readable by every authenticated
-- user, written only by migrations. The per-user tables record what a user has
-- unlocked, been assigned, or bought; all of them are client-read-only and are
-- written by the awarding functions (Domain Rule 15).
--
-- Quest and goal *progress* is never stored. It is recomputed from tasks,
-- calendar_blocks, focus_sessions and habit_completions for the period, in the
-- user's timezone, so it can never drift from the data it summarises.

-- Achievements ----------------------------------------------------------------

create table public.achievement_definitions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text not null,
  sort_order  integer not null default 0
);

alter table public.achievement_definitions enable row level security;

create policy "achievement_definitions: read"
  on public.achievement_definitions for select to authenticated
  using (true);

create table public.user_achievements (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievement_definitions (id) on delete cascade,
  unlocked_at    timestamptz not null default now(),

  primary key (user_id, achievement_id)
);

comment on table public.user_achievements is
  'An achievement unlocks once; the composite primary key is what makes that true.';

alter table public.user_achievements enable row level security;

create policy "user_achievements: select own"
  on public.user_achievements for select to authenticated
  using (user_id = (select auth.uid()));

-- Quests ----------------------------------------------------------------------

create table public.quest_definitions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  period      public.quest_period not null,
  metric      public.quest_metric not null,
  target      integer not null,
  xp_reward   integer not null,
  coin_reward integer not null,
  title       text not null,
  description text not null,
  active      boolean not null default true,

  constraint quest_definitions_target_chk check (target > 0),
  constraint quest_definitions_xp_chk     check (xp_reward between 0 and 100),
  constraint quest_definitions_coin_chk   check (coin_reward between 0 and 50),
  -- Volume caps live in the schema so no quest can ever encourage unhealthy
  -- amounts of work, whatever a later migration seeds (Domain Rule 7).
  constraint quest_definitions_volume_chk check (
    case
      when period = 'daily' and metric = 'focus_minutes'   then target <= 120
      when period = 'daily' and metric = 'tasks_completed' then target <= 5
      when period = 'weekly' and metric = 'focus_minutes'   then target <= 360
      when period = 'weekly' and metric = 'tasks_completed' then target <= 25
      when period = 'weekly' and metric = 'habit_days'      then target <= 7
      else true
    end
  )
);

alter table public.quest_definitions enable row level security;

create policy "quest_definitions: read"
  on public.quest_definitions for select to authenticated
  using (true);

create table public.quest_assignments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  quest_id     uuid not null references public.quest_definitions (id) on delete cascade,
  period       public.quest_period not null,
  -- The local date, or the week-start date, in the user's timezone.
  period_start date not null,
  slot         smallint not null,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),

  constraint quest_assignments_slot_chk check (slot >= 0)
);

create unique index quest_assignments_slot_uniq
  on public.quest_assignments (user_id, period, period_start, slot);
create unique index quest_assignments_quest_uniq
  on public.quest_assignments (user_id, quest_id, period_start);

alter table public.quest_assignments enable row level security;

create policy "quest_assignments: select own"
  on public.quest_assignments for select to authenticated
  using (user_id = (select auth.uid()));

-- Weekly goals -----------------------------------------------------------------

create table public.weekly_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  week_start   date not null,
  metric       public.quest_metric not null,
  target       integer not null,
  title        text,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint weekly_goals_target_chk check (target > 0)
);

create unique index weekly_goals_uniq on public.weekly_goals (user_id, week_start, metric);

create trigger weekly_goals_set_updated_at
  before update on public.weekly_goals
  for each row execute function public.set_updated_at();

create function public.guard_weekly_goals()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted() then
    return new;
  end if;

  if new.completed_at is distinct from old.completed_at then
    perform public.reject_guarded_write('weekly_goals', 'completed_at');
  end if;

  return new;
end;
$$;

create trigger weekly_goals_guard
  before update on public.weekly_goals
  for each row execute function public.guard_weekly_goals();

alter table public.weekly_goals enable row level security;

create policy "weekly_goals: select own"
  on public.weekly_goals for select to authenticated
  using (user_id = (select auth.uid()));

create policy "weekly_goals: insert own"
  on public.weekly_goals for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "weekly_goals: update own"
  on public.weekly_goals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "weekly_goals: delete own"
  on public.weekly_goals for delete to authenticated
  using (user_id = (select auth.uid()));

-- Cosmetics ---------------------------------------------------------------------

create table public.cosmetic_definitions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  kind        public.cosmetic_kind not null,
  name        text not null,
  description text not null,
  price       integer not null,
  sort_order  integer not null default 0,

  constraint cosmetic_definitions_price_chk check (price >= 0)
);

comment on table public.cosmetic_definitions is
  'Coins buy cosmetics only, never functionality (specs/08-gamification.md).';

alter table public.cosmetic_definitions enable row level security;

create policy "cosmetic_definitions: read"
  on public.cosmetic_definitions for select to authenticated
  using (true);

create table public.user_cosmetics (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  cosmetic_id  uuid not null references public.cosmetic_definitions (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  equipped     boolean not null default false,

  primary key (user_id, cosmetic_id)
);

-- Equipping one cosmetic of a kind un-equips the other, in one statement, so
-- the client cannot leave two equipped by failing between two requests.
create function public.enforce_one_equipped_per_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.equipped then
    update public.user_cosmetics uc
       set equipped = false
      from public.cosmetic_definitions cd, public.cosmetic_definitions target
     where uc.cosmetic_id = cd.id
       and target.id = new.cosmetic_id
       and cd.kind = target.kind
       and uc.user_id = new.user_id
       and uc.cosmetic_id <> new.cosmetic_id
       and uc.equipped;
  end if;

  return new;
end;
$$;

create trigger user_cosmetics_one_equipped
  after insert or update of equipped on public.user_cosmetics
  for each row execute function public.enforce_one_equipped_per_kind();

-- `equipped` is the only column the client may change; purchase_cosmetic()
-- owns the rest because it debits coins in the same transaction.
create function public.guard_user_cosmetics()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted() then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.cosmetic_id is distinct from old.cosmetic_id
     or new.purchased_at is distinct from old.purchased_at
  then
    perform public.reject_guarded_write('user_cosmetics', 'ownership');
  end if;

  return new;
end;
$$;

create trigger user_cosmetics_guard
  before update on public.user_cosmetics
  for each row execute function public.guard_user_cosmetics();

alter table public.user_cosmetics enable row level security;

create policy "user_cosmetics: select own"
  on public.user_cosmetics for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_cosmetics: update own"
  on public.user_cosmetics for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
