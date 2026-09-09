-- Momentum — habit_completions.
--
-- Exactly one row per habit per user-local date, for every frequency type
-- (Domain Rule 14). `amount` accumulates within the day; completing from a
-- calendar block and from the habits page upsert the same row. The uniqueness
-- is a database constraint, not a UI check.
--
-- `completion_date` is a date, not an instant: it is computed in the profile
-- timezone by record_habit_completion() (Domain Rule 4).

create table public.habit_completions (
  id              uuid primary key default gen_random_uuid(),
  habit_id        uuid not null references public.habits (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  completion_date date not null,
  amount          integer not null default 1,
  -- The block a completion came from may be deleted; the completion survives.
  source_block_id uuid references public.calendar_blocks (id) on delete set null,
  completed_at    timestamptz not null default now(),

  constraint habit_completions_amount_chk check (amount > 0)
);

create unique index habit_completions_uniq
  on public.habit_completions (habit_id, completion_date);
-- Week heatmap, Today, consistency maths.
create index habit_completions_user_date_idx
  on public.habit_completions (user_id, completion_date);

create trigger habit_completions_same_owner
  before insert or update on public.habit_completions
  for each row execute function public.assert_same_owner(
    'habit_id', 'habits', 'source_block_id', 'calendar_blocks'
  );

-- Writes go through record_habit_completion() / remove_habit_completion(),
-- which award XP exactly once per row (Domain Rule 15). The client may read.
alter table public.habit_completions enable row level security;

create policy "habit_completions: select own"
  on public.habit_completions for select to authenticated
  using (user_id = (select auth.uid()));
