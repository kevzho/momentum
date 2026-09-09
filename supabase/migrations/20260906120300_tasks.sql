-- Momentum — tasks.
--
-- NO SCHEDULING COLUMNS. When a task is worked on is expressed by its work
-- blocks (`calendar_blocks.kind = 'work'`, 0..n per task). Adding
-- scheduled_start / scheduled_end here is a Domain Rule 2 violation, not a
-- shortcut, and every later phase is built on that shape.
--
-- `due_date` is a deadline and a calendar date in the user's timezone; it is
-- deliberately a different concept from a work block (Domain Rule 1).

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  project_id        uuid references public.projects (id) on delete set null,
  parent_task_id    uuid references public.tasks (id) on delete cascade,
  title             text not null,
  description       text,
  status            public.task_status not null default 'open',
  priority          smallint not null default 4,
  estimated_minutes integer,
  actual_minutes    integer not null default 0,
  due_date          date,
  completed_at      timestamptz,
  archived_at       timestamptz,
  sort_order        double precision not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tasks_title_chk     check (length(title) between 1 and 500),
  constraint tasks_priority_chk  check (priority between 1 and 4),
  constraint tasks_estimate_chk  check (estimated_minutes is null
                                        or (estimated_minutes > 0 and estimated_minutes <= 10080)),
  constraint tasks_actual_chk    check (actual_minutes >= 0),
  constraint tasks_no_self_parent_chk check (parent_task_id is distinct from id),
  -- Status and its timestamps can never disagree.
  constraint tasks_status_completed_chk check ((status = 'completed') = (completed_at is not null)),
  constraint tasks_status_archived_chk  check (status <> 'archived' or archived_at is not null)
);

comment on table public.tasks is
  'Units of work. Scheduling lives in calendar_blocks (Domain Rule 2); this table has no start/end columns by design.';
comment on column public.tasks.estimated_minutes is
  'User intent. Never overwritten by actuals (Domain Rule 3).';
comment on column public.tasks.actual_minutes is
  'Guarded: accumulated by finish_focus_session(). Never client-writable.';
comment on column public.tasks.sort_order is
  'Manual ordering; double precision so a row can be inserted at the midpoint of two neighbours.';

-- Today / Upcoming / Completed / At Risk all filter by owner and status and
-- order or bound by due date.
create index tasks_user_status_due_idx on public.tasks (user_id, status, due_date);
-- Per-project view and drag reordering.
create index tasks_user_project_idx on public.tasks (user_id, project_id, sort_order);
-- Subtask lists, and the cascade.
create index tasks_parent_idx on public.tasks (parent_task_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger tasks_same_owner
  before insert or update on public.tasks
  for each row execute function public.assert_same_owner('project_id', 'projects', 'parent_task_id', 'tasks');

-- Subtasks are one level deep -------------------------------------------------

create function public.enforce_subtask_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.tasks;
begin
  if new.parent_task_id is null then
    return new;
  end if;

  select * into v_parent from public.tasks t where t.id = new.parent_task_id;

  if v_parent.parent_task_id is not null then
    raise exception 'subtasks are one level deep: % already has a parent', new.parent_task_id
      using errcode = '23514';
  end if;

  -- A subtask always belongs to its parent's project, so the two can never
  -- drift apart in the UI.
  new.project_id := v_parent.project_id;

  return new;
end;
$$;

create trigger tasks_enforce_subtask_depth
  before insert or update of parent_task_id, project_id on public.tasks
  for each row execute function public.enforce_subtask_depth();

-- Guarded columns -------------------------------------------------------------
--
-- status, completed_at and actual_minutes are written by complete_task(),
-- uncomplete_task() and finish_focus_session(). Archiving is exempt: it is an
-- ordinary client update and never touches completion (Domain Rule 15).

create function public.guard_tasks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted() then
    return new;
  end if;

  if new.actual_minutes is distinct from old.actual_minutes then
    perform public.reject_guarded_write('tasks', 'actual_minutes');
  end if;
  if new.completed_at is distinct from old.completed_at then
    perform public.reject_guarded_write('tasks', 'completed_at');
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('open', 'archived') and new.status in ('open', 'archived'))
  then
    perform public.reject_guarded_write('tasks', 'status');
  end if;

  return new;
end;
$$;

create trigger tasks_guard
  before update on public.tasks
  for each row execute function public.guard_tasks();

alter table public.tasks enable row level security;

create policy "tasks: select own"
  on public.tasks for select to authenticated
  using (user_id = (select auth.uid()));

create policy "tasks: insert own"
  on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "tasks: update own"
  on public.tasks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "tasks: delete own"
  on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()));
