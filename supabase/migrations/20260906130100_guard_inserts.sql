-- Momentum — close the guarded columns on INSERT, and narrow the trusted window.
--
-- Phase 2 wrote the guards as `before update` triggers, which is the shape the
-- threat model describes ("columns a policy lets the user write") but not the
-- whole of it. A row does not have to be updated into a completed state; it can
-- be *created* in one. Verified against the running stack as the signed-in demo
-- user, over PostgREST, with nothing but the publishable key and a session:
--
--   POST /rest/v1/calendar_blocks  {"kind":"event", "completed_at":"…"}     -> 201, persisted
--   POST /rest/v1/tasks            {"status":"completed","actual_minutes":999} -> 201, persisted
--
-- The second one is the serious one. `tasks.actual_minutes` is the number
-- Domain Rule 3 calls the product's most valuable long-term signal and Phase 7
-- writes only from measured focus sessions; a client that can invent it can
-- invent the estimate-calibration history, and Phase 8's XP reads the same
-- rows. Domain Rule 15 says these columns are written "only by `security
-- definer` database functions" — on INSERT that was not true.
--
-- Phase 3 fixes it because Phase 3 is the phase that opens the first sanctioned
-- path through these guards, and a door is only as good as the wall beside it.
--
-- The seed is unaffected: `supabase/seed.sql` already sets `momentum.trusted`
-- for its whole session (line 20) and resets it at the end, so its completed
-- tasks and blocks still load.

-- ---------------------------------------------------------------------------
-- calendar_blocks
-- ---------------------------------------------------------------------------

create or replace function public.guard_blocks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted() then
    return new;
  end if;

  -- On INSERT there is no `old` to compare against: the rule is simply that a
  -- block cannot be born executed. `complete_block()` is the only way in.
  if tg_op = 'INSERT' then
    if new.completed_at is not null then
      perform public.reject_guarded_write('calendar_blocks', 'completed_at');
    end if;
    return new;
  end if;

  if new.completed_at is distinct from old.completed_at then
    perform public.reject_guarded_write('calendar_blocks', 'completed_at');
  end if;

  return new;
end;
$$;

drop trigger if exists blocks_guard on public.calendar_blocks;
create trigger blocks_guard
  before insert or update on public.calendar_blocks
  for each row execute function public.guard_blocks();

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create or replace function public.guard_tasks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A task may be created open, or created already archived (archiving is an
    -- ordinary client write and says nothing about completion). It may not be
    -- created completed, may not arrive with a completion time, and may not
    -- arrive with actual minutes nobody measured (Domain Rule 3).
    if new.status = 'completed' then
      perform public.reject_guarded_write('tasks', 'status');
    end if;
    if new.completed_at is not null then
      perform public.reject_guarded_write('tasks', 'completed_at');
    end if;
    if coalesce(new.actual_minutes, 0) <> 0 then
      perform public.reject_guarded_write('tasks', 'actual_minutes');
    end if;
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

drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard
  before insert or update on public.tasks
  for each row execute function public.guard_tasks();

-- ---------------------------------------------------------------------------
-- weekly_goals
-- ---------------------------------------------------------------------------
--
-- The same shape: `weekly_goals` is client-insertable and its `completed_at` is
-- guarded, so it had the same hole. Phase 8 owns `claim_weekly_goal()`; this
-- only makes sure the column is still waiting for it.

create or replace function public.guard_weekly_goals()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.completed_at is not null then
      perform public.reject_guarded_write('weekly_goals', 'completed_at');
    end if;
    return new;
  end if;

  if new.completed_at is distinct from old.completed_at then
    perform public.reject_guarded_write('weekly_goals', 'completed_at');
  end if;

  return new;
end;
$$;

drop trigger if exists weekly_goals_guard on public.weekly_goals;
create trigger weekly_goals_guard
  before insert or update on public.weekly_goals
  for each row execute function public.guard_weekly_goals();

-- ---------------------------------------------------------------------------
-- Exposure
-- ---------------------------------------------------------------------------
--
-- `20260906121200_grants.sql` revoked execute on future functions by default,
-- but `alter default privileges` only governs objects created afterwards *by
-- the role that ran it*, and the migration runner does not satisfy that here:
-- `POST /rest/v1/rpc/assert_caller` answered 204 for a signed-in user, and the
-- four trusted functions were reachable by `anon` (rejected inside, but
-- reachable). Say it explicitly instead of relying on a default.

revoke execute on function public.assert_caller(uuid) from public, anon, authenticated;
revoke execute on function public.complete_block(uuid, boolean) from public, anon;
revoke execute on function public.uncomplete_block(uuid, boolean) from public, anon;
revoke execute on function public.complete_task(uuid) from public, anon;
revoke execute on function public.uncomplete_task(uuid) from public, anon;

grant execute on function public.complete_block(uuid, boolean) to authenticated;
grant execute on function public.uncomplete_block(uuid, boolean) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.uncomplete_task(uuid) to authenticated;
