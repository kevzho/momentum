-- Momentum — the calendar's trusted writes (Phase 3).
--
-- Phase 2 shipped the schema, the guards and the grants, and deliberately
-- shipped no sanctioned path through the guards: `calendar_blocks.completed_at`
-- and `tasks.status/completed_at` are currently writable by nothing at all. The
-- path arrives with the phase that owns the feature (docs/DATABASE.md §
-- Functions), and Phase 3 owns the completion control on a block, so it is this
-- migration that opens the door — for exactly the four transitions the control
-- can cause, and no others.
--
-- Every function below is `security definer` (it must outrank the guard
-- triggers), `set search_path = ''` (it behaves identically whichever role and
-- session invokes it), calls `public.assert_caller()` before it touches
-- anything, and returns the affected row so a server action can hand the result
-- straight back to the UI.
--
-- Ordering inside each body is load-bearing:
--
--   1. read the row  — `security definer` sees past RLS, which is the only way
--                      to tell "not yours" apart from "does not exist" and
--                      answer both without leaking which;
--   2. assert_caller — before any write, and before the trusted flag is set;
--   3. set the flag  — `set_config(..., true)` is transaction-local, and
--                      PostgREST runs one transaction per request, so it cannot
--                      outlive the call that set it (docs/ARCHITECTURE.md §12);
--   4. write;
--   5. clear the flag — immediately, in the same body.
--
-- Step 5 matters more than it looks. "It cannot outlive the request" is true and
-- is not the whole story: within one transaction the flag stays on after the
-- function returns, so any later statement in that same transaction writes a
-- guarded column freely. PostgREST does not batch that way today, but the guard
-- should not depend on a client's request shape, and a future caller that wraps
-- two RPCs in one transaction would silently open every guard in it. The window
-- is therefore exactly the write, and the early returns below happen *before*
-- the flag is set rather than after.
--
-- Every function is idempotent, because Domain Rule 17 lets an optimistic
-- mutation be retried after a network failure: a second identical call is a
-- no-op that still returns the row, never an error. Idempotency here means
-- "converge on the requested state", not "refuse the second call" — a retry of
-- `complete_block(id, true)` whose first attempt completed the block but lost
-- the response still has to finish the job on the task.
--
-- Times are stamped with `now()`, never with a client value (Domain Rule 15).
-- That is the whole point of routing these writes through the database.

-- ---------------------------------------------------------------------------
-- assert_caller
-- ---------------------------------------------------------------------------
--
-- docs/DATABASE.md deferred this "with the functions that use it"; these are
-- the first of them.
--
-- Inside a `security definer` body the row-level policies are not consulted, so
-- the ownership check that RLS would have made has to be made explicitly. It is
-- made against the row's stored `user_id` — read from the table, never taken
-- from an argument — so a caller cannot assert whose row it is.
--
-- `42501` (insufficient_privilege) rather than a not-found: the caller is asking
-- about a row that exists and is not theirs, and PostgREST maps that SQLSTATE to
-- 403, which `features/calendar/actions.ts` maps to `forbidden`.
--
-- It is not granted to `authenticated` on purpose. The functions that call it
-- are `security definer` and run as this migration's owner, which already has
-- execute; granting it would publish a `/rpc/assert_caller` endpoint that does
-- nothing a caller could use.

create function public.assert_caller(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_user_id is distinct from (select auth.uid()) then
    raise exception 'this row belongs to another account'
      using errcode = '42501',
            hint = 'Trusted functions act only on rows owned by the calling user.';
  end if;
end;
$$;

comment on function public.assert_caller(uuid) is
  'Raises 42501 unless the argument is the calling user. First statement of every trusted function (docs/ARCHITECTURE.md §12).';

-- ---------------------------------------------------------------------------
-- Task completion
-- ---------------------------------------------------------------------------
--
-- SCOPE NOTE — read before extending this function.
--
-- docs/DATABASE.md lists `complete_task` and `uncomplete_task` under Phase 4,
-- because Phase 4 owns the task manager, and describes a body that also inserts
-- an `xp_events` row and calls `evaluate_achievements()`. Neither `xp_rule()`
-- nor `evaluate_achievements()` exists: they are Phase 8's, and the level curve
-- is Phase 8's to finalise. Inventing an XP amount here would be guessing at a
-- number another phase has to own, and Domain Rule 6 makes that number the
-- server's single source of truth — a wrong one is worse than a missing one.
--
-- Phase 3 needs the *state change* only, because a work block's completion
-- control is a Phase 3 acceptance criterion and Domain Rule 13 says that control
-- sometimes completes the task. So this ships the transition and nothing else.
--
-- **The XP award and the achievement evaluation are added by the phases that own
-- them** (Phase 8 for `xp_rule()` / `evaluate_achievements()`, Phase 4 for the
-- task manager's own callers). This function is already the single sanctioned
-- path through `guard_tasks()`, so adding them later changes no caller: the
-- server actions, the repositories and the UI all keep calling exactly this
-- name with exactly these arguments.

create function public.complete_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks t where t.id = p_task_id;
  if not found then
    raise exception 'task % does not exist', p_task_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_task.user_id);

  -- Idempotent, and deliberately without re-stamping: a retried mutation must
  -- not move a completion time the user already earned, and `updated_at` should
  -- not churn for a call that changed nothing. Returning here also returns
  -- before the trusted flag is ever set.
  if v_task.status = 'completed' then
    return v_task;
  end if;

  perform set_config('momentum.trusted', 'on', true);

  -- `tasks_status_completed_chk` is `(status = 'completed') = (completed_at is
  -- not null)`, so the two columns can only ever move together, in one update.
  update public.tasks t
     set status = 'completed',
         completed_at = now()
   where t.id = p_task_id
  returning * into v_task;

  perform set_config('momentum.trusted', 'off', true);

  -- Completing a task never touches its blocks (Domain Rule 13). Incomplete
  -- future blocks stay on the calendar and render as settled; nothing here
  -- deletes or completes them, and un-completing restores the task with those
  -- blocks exactly as they were.
  return v_task;
end;
$$;

comment on function public.complete_task(uuid) is
  'Phase 3 ships the state transition only; the XP award and evaluate_achievements() arrive with the phases that own them (Phase 8). Idempotent. Never touches the task''s blocks (Domain Rule 13).';

create function public.uncomplete_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks t where t.id = p_task_id;
  if not found then
    raise exception 'task % does not exist', p_task_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_task.user_id);
  if v_task.status <> 'completed' then
    return v_task;
  end if;

  perform set_config('momentum.trusted', 'on', true);

  update public.tasks t
     set status = 'open',
         completed_at = null
   where t.id = p_task_id
  returning * into v_task;

  perform set_config('momentum.trusted', 'off', true);

  -- XP stays (Domain Rule 7: nothing punitive, and the ledger is append-only).
  -- There is no XP to leave behind yet, but the rule is why this function does
  -- not go looking for one.
  return v_task;
end;
$$;

comment on function public.uncomplete_task(uuid) is
  'Returns a task to open and clears completed_at. XP is never withdrawn (Domain Rules 7 and 15). Idempotent.';

-- ---------------------------------------------------------------------------
-- Block completion
-- ---------------------------------------------------------------------------
--
-- Completing a block means "this span was executed" and nothing more
-- (Domain Rule 13): it sets `completed_at` on the block, and does not touch the
-- task, the habit, or any other block.
--
-- `p_also_complete_task` is the *UI's* decision, not this function's. The server
-- resolves it in `features/calendar/queries.ts` from the task's other blocks —
-- the control reads "Complete task" when this is the task's only block or its
-- last incomplete one, and "Done with this block" otherwise — and sends the
-- answer with the call. Recomputing it here would put the same rule in two
-- places and let the label disagree with the effect.

create function public.complete_block(
  p_block_id uuid,
  p_also_complete_task boolean default false
)
returns public.calendar_blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block public.calendar_blocks;
begin
  select * into v_block from public.calendar_blocks b where b.id = p_block_id;
  if not found then
    raise exception 'calendar block % does not exist', p_block_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_block.user_id);

  if v_block.completed_at is null then
    perform set_config('momentum.trusted', 'on', true);
    update public.calendar_blocks b
       set completed_at = now()
     where b.id = p_block_id
    returning * into v_block;
    perform set_config('momentum.trusted', 'off', true);
  end if;

  if p_also_complete_task then
    if v_block.task_id is null then
      raise exception 'only a work block can complete a task, and % is a % block',
        p_block_id, v_block.kind
        using errcode = '22023',
              hint = 'Call complete_block without p_also_complete_task for events and habit blocks.';
    end if;
    -- Deliberately outside the `completed_at is null` branch above: a retry
    -- whose first attempt completed the block but lost its response still has
    -- to finish the job. complete_task() is itself idempotent.
    perform public.complete_task(v_block.task_id);
  end if;

  return v_block;
end;
$$;

comment on function public.complete_block(uuid, boolean) is
  'Records that a planned span was executed. Completes the task too only when the caller says so (Domain Rule 13). Idempotent.';

-- Domain Rule 13's reversing direction. `p_also_uncomplete_task` mirrors
-- `complete_block`'s flag: the block's task is complete, and un-completing this
-- block reopens it, because the two were one user action and a control that
-- cannot be undone strands the user. As with completing, the caller decides —
-- the label and the effect are then chosen in the same place and cannot drift.

create function public.uncomplete_block(
  p_block_id uuid,
  p_also_uncomplete_task boolean default false
)
returns public.calendar_blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block public.calendar_blocks;
begin
  select * into v_block from public.calendar_blocks b where b.id = p_block_id;
  if not found then
    raise exception 'calendar block % does not exist', p_block_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_block.user_id);

  if v_block.completed_at is not null then
    perform set_config('momentum.trusted', 'on', true);
    update public.calendar_blocks b
       set completed_at = null
     where b.id = p_block_id
    returning * into v_block;
    perform set_config('momentum.trusted', 'off', true);
  end if;

  if p_also_uncomplete_task then
    if v_block.task_id is null then
      raise exception 'only a work block can reopen a task, and % is a % block',
        p_block_id, v_block.kind
        using errcode = '22023',
              hint = 'Call uncomplete_block without p_also_uncomplete_task for events and habit blocks.';
    end if;
    -- Outside the branch above for the same reason complete_block's is: a retry
    -- whose first attempt cleared the block but lost its response still has to
    -- finish the job. uncomplete_task() is itself idempotent.
    perform public.uncomplete_task(v_block.task_id);
  end if;

  return v_block;
end;
$$;

comment on function public.uncomplete_block(uuid, boolean) is
  'Clears a block''s completed_at, and reopens its task only when the caller says so (Domain Rule 13). Idempotent.';

-- ---------------------------------------------------------------------------
-- Exposure
-- ---------------------------------------------------------------------------
--
-- `20260906121200_grants.sql` revoked execute on everything in `public` from
-- PUBLIC, `anon` and `authenticated`, and revoked it from future functions by
-- default, so a function is reachable over HTTP only when its own phase says so.
-- These four are the sanctioned paths a signed-in user calls; `assert_caller` is
-- not among them (see its comment above).

grant execute on function public.complete_block(uuid, boolean) to authenticated;
grant execute on function public.uncomplete_block(uuid, boolean) to authenticated;
grant execute on function public.complete_task(uuid)            to authenticated;
grant execute on function public.uncomplete_task(uuid)          to authenticated;
