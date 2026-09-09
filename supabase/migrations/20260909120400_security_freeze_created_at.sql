-- Momentum — security hardening: creation timestamps are the database's to set,
-- not the client's to assert.
--
-- The audit (2026-09-09) confirmed that `created_at` is client-writable on every
-- client-writable table: the INSERT/UPDATE grants are column-wide, `set_updated_at`
-- only stamps `updated_at`, and no guard covered `created_at`. A signed-in user
-- could PATCH their own task/profile/block/etc. `created_at` to any value
-- (verified live: `update tasks set created_at = '2000-01-01'` -> UPDATE 1).
--
-- This is own-rows-only and mints no XP (the one place a block's `created_at` is
-- read — the "planner" achievement's `start_at > created_at` — is satisfiable by
-- scheduling ahead anyway), so it is an audit-trail / analytics-integrity issue
-- rather than a cross-user or economy one. But a creation time the row's subject
-- can rewrite is not a creation time, and the fix is a single generic trigger.
--
-- Like the other guards it yields to `is_trusted()`, so the seed (which sets
-- `momentum.trusted` for its whole session) still backdates its history, and any
-- future trusted function may set an explicit `created_at` deliberately.

create function public.freeze_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A row is created now, whatever the client claimed.
    new.created_at := now();
    return new;
  end if;

  -- On update the value is immutable; silently hold it rather than raise, so a
  -- client that echoes the whole row back is not rejected for a field it did not
  -- mean to change.
  if new.created_at is distinct from old.created_at then
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

comment on function public.freeze_created_at() is
  'BEFORE INSERT OR UPDATE: created_at is stamped by the database on insert and immutable thereafter, unless a trusted function is acting (e.g. the seed backdating history).';

create trigger profiles_freeze_created_at
  before insert or update on public.profiles
  for each row execute function public.freeze_created_at();

create trigger projects_freeze_created_at
  before insert or update on public.projects
  for each row execute function public.freeze_created_at();

create trigger tasks_freeze_created_at
  before insert or update on public.tasks
  for each row execute function public.freeze_created_at();

create trigger calendar_blocks_freeze_created_at
  before insert or update on public.calendar_blocks
  for each row execute function public.freeze_created_at();

create trigger habits_freeze_created_at
  before insert or update on public.habits
  for each row execute function public.freeze_created_at();

create trigger weekly_goals_freeze_created_at
  before insert or update on public.weekly_goals
  for each row execute function public.freeze_created_at();

create trigger weekly_reviews_freeze_created_at
  before insert or update on public.weekly_reviews
  for each row execute function public.freeze_created_at();
