-- Momentum — focus sessions and pauses.
--
-- Timer truth. Every timestamp on these tables is stamped by the database
-- clock inside a trusted function; the client never supplies one, which is what
-- makes the timer and its XP farm-resistant (Domain Rule 15).

create table public.focus_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  -- The session outlives the task or project it was attributed to.
  task_id            uuid references public.tasks (id) on delete set null,
  project_id         uuid references public.projects (id) on delete set null,
  planned_minutes    integer not null,
  actual_minutes     integer,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  status             public.focus_status not null default 'running',
  interruption_count integer not null default 0,
  created_at         timestamptz not null default now(),

  constraint focus_planned_chk      check (planned_minutes between 1 and 240),
  constraint focus_actual_range_chk check (actual_minutes is null or actual_minutes >= 0),
  constraint focus_interruption_chk check (interruption_count >= 0),
  constraint focus_ended_chk        check ((status in ('completed', 'abandoned')) = (ended_at is not null)),
  constraint focus_actual_chk       check (status <> 'completed' or actual_minutes is not null),
  constraint focus_order_chk        check (ended_at is null or ended_at >= started_at)
);

comment on column public.focus_sessions.actual_minutes is
  'Measured, excluding paused time. Never the estimate (Domain Rule 3).';

-- At most one live session per user, so concurrent timers cannot double-count.
create unique index focus_sessions_active_uniq on public.focus_sessions (user_id)
  where status in ('running', 'paused');
create index focus_sessions_user_started_idx on public.focus_sessions (user_id, started_at desc);

create trigger focus_sessions_same_owner
  before insert or update on public.focus_sessions
  for each row execute function public.assert_same_owner('task_id', 'tasks', 'project_id', 'projects');

alter table public.focus_sessions enable row level security;

create policy "focus_sessions: select own"
  on public.focus_sessions for select to authenticated
  using (user_id = (select auth.uid()));

create table public.focus_pauses (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.focus_sessions (id) on delete cascade,
  -- Denormalised so the policy is a column comparison, not a join.
  user_id    uuid not null references public.profiles (id) on delete cascade,
  paused_at  timestamptz not null default now(),
  resumed_at timestamptz,

  constraint focus_pauses_order_chk check (resumed_at is null or resumed_at > paused_at)
);

-- A session can have at most one open pause.
create unique index focus_pauses_open_uniq on public.focus_pauses (session_id)
  where resumed_at is null;
create index focus_pauses_session_idx on public.focus_pauses (session_id);

create trigger focus_pauses_same_owner
  before insert or update on public.focus_pauses
  for each row execute function public.assert_same_owner('session_id', 'focus_sessions');

alter table public.focus_pauses enable row level security;

create policy "focus_pauses: select own"
  on public.focus_pauses for select to authenticated
  using (user_id = (select auth.uid()));
