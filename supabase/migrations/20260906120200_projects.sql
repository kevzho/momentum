-- Momentum — projects.
--
-- Deleting a project never deletes work: tasks and focus sessions fall back to
-- the inbox (`project_id` set to null). Archiving is the normal path.

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  description text,
  color       public.project_color not null default 'blue',
  icon        text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint projects_name_chk check (length(name) between 1 and 100)
);

comment on column public.projects.icon is 'Icon key from the icon library, or null for a plain colour dot.';

-- Sidebar list: the caller's projects, active ones first.
create index projects_user_idx on public.projects (user_id, archived_at);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "projects: select own"
  on public.projects for select to authenticated
  using (user_id = (select auth.uid()));

create policy "projects: insert own"
  on public.projects for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "projects: update own"
  on public.projects for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "projects: delete own"
  on public.projects for delete to authenticated
  using (user_id = (select auth.uid()));
