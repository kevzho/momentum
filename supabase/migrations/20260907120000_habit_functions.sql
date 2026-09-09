-- Momentum — the habits' trusted writes (Phase 6).
--
-- `habit_completions` is client-read-only: the grants in
-- `20260906121200_grants.sql` give `authenticated` `select` and nothing else,
-- so every row in it is written here (Domain Rule 15). These functions are the
-- sanctioned path, and this migration is where they open.
--
-- They follow the shape `20260906130000_calendar_functions.sql` established:
-- `security definer` so they outrank the guard triggers, `set search_path = ''`
-- so they behave identically whichever session invokes them,
-- `public.assert_caller()` before any write, and the affected row returned so a
-- server action can hand it straight back to the UI.
--
-- Three rules run through all of them.
--
-- **One row per habit per user-local date** (Domain Rule 14). The date is
-- computed from `profiles.timezone` and never from the server's clock or a
-- client-supplied value (Domain Rule 4), and `habit_completions_uniq` makes the
-- uniqueness the database's fact rather than a UI convention. Completing from
-- the habits page and from a calendar block reach the same row.
--
-- **Nothing is punitive** (Domain Rule 7). `remove_habit_completion` deletes a
-- completion; it never removes XP, and the ledger is append-only.
--
-- **XP is awarded once per row, ever** (Domain Rule 6). A completion's row id is
-- derived from `(habit_id, completion_date)` rather than being random, so
-- recording, removing and re-recording the same day collides with its own
-- earlier `xp_events` row on `xp_events_source_uniq` instead of minting a
-- second award. The award amount comes from `habits.xp_reward`, which the
-- schema already caps at 50 — this function invents no number, and the profile
-- total and `evaluate_achievements()` remain Phase 8's to add, exactly as
-- `complete_task` left them.

-- ---------------------------------------------------------------------------
-- habit_completion_id
-- ---------------------------------------------------------------------------
--
-- The identity of "this habit on this date", as a uuid.
--
-- `habit_completions_uniq` already says that pair is the row's natural key.
-- Making the primary key agree with it is what lets the XP ledger point at the
-- completion by id and still be idempotent across a delete and a re-record: the
-- id is a function of the fact, not of the attempt that wrote it (the same
-- reasoning as Domain Rule 17, one step further in).
--
-- md5 is used as a hash, not as a security primitive: this is a naming scheme
-- for rows the caller already owns, and every read of them is behind RLS.
-- Not granted to `authenticated` — nothing outside these bodies calls it.

create function public.habit_completion_id(p_habit_id uuid, p_on_date date)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select md5(p_habit_id::text || ':' || p_on_date::text)::uuid;
$$;

comment on function public.habit_completion_id(uuid, date) is
  'Deterministic id for a habit completion, derived from its natural key (habit_id, completion_date). Makes the XP award idempotent across remove and re-record (Domain Rule 6).';

-- ---------------------------------------------------------------------------
-- record_habit_completion
-- ---------------------------------------------------------------------------
--
-- The one write. The habits page calls it directly; `complete_habit_block`
-- calls it with the block's own date and length.
--
-- `p_on_date` must be within one day of today in the *profile's* timezone.
-- The window exists so that the completion the user records is the day they are
-- living in — including the hours either side of midnight, where the device and
-- the profile can disagree — without opening arbitrary back-fill of history,
-- which would let a caller mint an XP event per past day at will.
--
-- Boolean habits (`daily`, `weekdays`, `times_per_week`) ignore `p_amount`
-- entirely: their row is a tick, a second completion on the same day is a no-op,
-- and a row carrying an amount above 1 would count as two days of a weekly
-- target. Amount habits add to the day's total, which is what makes "20 minutes
-- this morning and 10 more tonight" one row of 30 (Domain Rule 14).

create function public.record_habit_completion(
  p_habit_id        uuid,
  p_on_date         date,
  p_amount          integer default 1,
  p_source_block_id uuid default null
)
returns public.habit_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_habit      public.habits;
  v_today      date;
  v_amount     integer;
  v_row        public.habit_completions;
begin
  select * into v_habit from public.habits h where h.id = p_habit_id;
  if not found then
    raise exception 'habit % does not exist', p_habit_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_habit.user_id);

  -- The user's own day, never the server's (Domain Rule 4).
  select (now() at time zone p.timezone)::date
    into v_today
    from public.profiles p
   where p.id = v_habit.user_id;

  if p_on_date < v_today - 1 or p_on_date > v_today + 1 then
    raise exception 'a habit completion is recorded for yesterday, today or tomorrow (% is outside that)', p_on_date
      using errcode = '22023',
            hint = 'Edit the habit''s history from the habit itself, not by recording a completion on a distant date.';
  end if;

  -- A boolean habit's row is a tick. An amount habit's is a quantity, and a
  -- non-positive one is not a completion (`habit_completions_amount_chk`).
  if v_habit.frequency_type in ('amount_per_day', 'amount_per_week') then
    v_amount := greatest(coalesce(p_amount, 1), 1);
  else
    v_amount := 1;
  end if;

  -- The block a completion came from has to be this habit's own block. RLS is
  -- not consulted inside a `security definer` body, so the check is explicit —
  -- and `habit_completions_same_owner` would only catch a foreign *account*,
  -- not another habit of the caller's own.
  if p_source_block_id is not null then
    perform 1
       from public.calendar_blocks b
      where b.id = p_source_block_id
        and b.user_id = v_habit.user_id
        and b.habit_id = p_habit_id;
    if not found then
      raise exception 'calendar block % is not a block of habit %', p_source_block_id, p_habit_id
        using errcode = '22023';
    end if;
  end if;

  -- Aliased `c` so the DO UPDATE clause can name the existing row unambiguously;
  -- `excluded` is the row this statement proposed. `completed_at` is not in the
  -- SET list, so the day keeps the time it was first recorded.
  insert into public.habit_completions as c
    (id, habit_id, user_id, completion_date, amount, source_block_id)
  values
    (public.habit_completion_id(p_habit_id, p_on_date), p_habit_id, v_habit.user_id,
     p_on_date, v_amount, p_source_block_id)
  on conflict (habit_id, completion_date) do update
    -- Boolean habits: a second completion on the same day changes nothing.
    -- Amount habits: the day accumulates.
    set amount = case
                   when v_habit.frequency_type in ('amount_per_day', 'amount_per_week')
                     then c.amount + excluded.amount
                   else c.amount
                 end
  returning * into v_row;

  -- `source_block_id` is deliberately absent from the SET list above. It records
  -- which block *created* this day's row, and an update must not change that:
  -- coalescing the incoming block into a row the user had already ticked from
  -- the habits page let that block claim it, and un-completing the block then
  -- deleted a completion the block never made — the opposite of what Domain
  -- Rule 13 says un-completing a block does. A row created by a block keeps its
  -- block; a row created by hand stays unowned.
  --
  -- _(Found by the first live run of this migration, in Phase 8.)_

  -- One award per completion row, ever. The insert is guarded by
  -- `xp_events_source_uniq (user_id, source_type, source_id)`, so a re-record
  -- after a removal collides with the original award rather than adding a
  -- second one (Domain Rule 6), and nothing is ever withdrawn (Domain Rule 7).
  if v_habit.xp_reward > 0 then
    insert into public.xp_events (user_id, source_type, source_id, amount, reason)
    values (v_habit.user_id, 'habit_completion', v_row.id, v_habit.xp_reward,
            format('Completed "%s"', v_habit.name))
    on conflict do nothing;
  end if;

  return v_row;
end;
$$;

comment on function public.record_habit_completion(uuid, date, integer, uuid) is
  'Upserts the one row for (habit, user-local date) and awards its XP once, ever. Boolean habits ignore the amount; amount habits accumulate (Domain Rules 6, 14).';

-- ---------------------------------------------------------------------------
-- remove_habit_completion
-- ---------------------------------------------------------------------------
--
-- Un-ticking a day. The row goes; the XP stays, because the ledger is
-- append-only and Momentum never takes progress back (Domain Rule 7).
--
-- Idempotent: removing a day that was never recorded returns null rather than
-- raising, so a retried mutation settles on the same state (Domain Rule 17).

-- `returns setof`, and the reason is the whole of what this function has to get
-- right. It returns "the row that was removed, or nothing", and a composite
-- return type cannot express the second half: `return null` from a function
-- declared `returns public.habit_completions` produces a NULL *composite*,
-- which PostgREST expands into a row of nulls — an object the client then tries
-- to read a completion date out of. `setof` says "nothing" by returning no
-- rows, which reaches the caller as an empty array and maps cleanly to null.
--
-- _(Found by the first live run of this migration, in Phase 8. The comment this
-- replaces stated the intent correctly and the mechanism did not honour it,
-- which is exactly the class of defect a database suite exists to catch.)_

create function public.remove_habit_completion(p_habit_id uuid, p_on_date date)
returns setof public.habit_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_habit public.habits;
  v_row   public.habit_completions;
begin
  select * into v_habit from public.habits h where h.id = p_habit_id;
  if not found then
    raise exception 'habit % does not exist', p_habit_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_habit.user_id);

  delete from public.habit_completions c
   where c.habit_id = p_habit_id
     and c.completion_date = p_on_date
  returning * into v_row;

  if not found then
    return;
  end if;

  return next v_row;
end;
$$;

comment on function public.remove_habit_completion(uuid, date) is
  'Deletes one habit completion. XP already awarded is never withdrawn (Domain Rule 7). Idempotent.';

-- ---------------------------------------------------------------------------
-- complete_habit_block / uncomplete_habit_block
-- ---------------------------------------------------------------------------
--
-- Completing a habit block is two facts in one transaction: the planned span
-- was executed (Domain Rule 13's `completed_at` on the block) and the habit was
-- done that day (one row in `habit_completions`). Doing them in one function is
-- what makes "exactly one completion" true under a retry — a second call finds
-- the block already complete and the day's row already there, and changes
-- nothing.
--
-- The completion's date is the block's *own* local date, not today's: a block
-- placed on Wednesday morning records Wednesday. `record_habit_completion`
-- applies its ±1 day window to that date, so a block older than yesterday
-- cannot be used to back-fill history. The UI offers the control only on blocks
-- inside that window, so the user is never shown an action that must fail
-- (the same principle as Domain Rule 13's labelling).
--
-- The amount is the block's own length for a habit measured in minutes, because
-- that is the honest number for the span the user just executed, and one for
-- everything else. Boolean habits ignore it either way.

create function public.complete_habit_block(p_block_id uuid)
returns public.calendar_blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block  public.calendar_blocks;
  v_habit  public.habits;
  v_zone   text;
  v_date   date;
  v_amount integer;
begin
  select * into v_block from public.calendar_blocks b where b.id = p_block_id;
  if not found then
    raise exception 'calendar block % does not exist', p_block_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_block.user_id);

  if v_block.kind <> 'habit' or v_block.habit_id is null then
    raise exception 'only a habit block records a habit completion, and % is a % block',
      p_block_id, v_block.kind
      using errcode = '22023',
            hint = 'Use complete_block for events and work blocks.';
  end if;

  select * into v_habit from public.habits h where h.id = v_block.habit_id;
  if not found then
    raise exception 'habit % does not exist', v_block.habit_id using errcode = 'P0002';
  end if;

  select p.timezone into v_zone from public.profiles p where p.id = v_block.user_id;
  v_date := (v_block.start_at at time zone v_zone)::date;

  if v_habit.unit = 'minutes' then
    v_amount := greatest(1, (extract(epoch from (v_block.end_at - v_block.start_at)) / 60)::integer);
  else
    v_amount := 1;
  end if;

  -- The completion first: if its date is outside the recording window the whole
  -- transaction fails, and the block is not left marked done for a day the
  -- habit has no record of.
  perform public.record_habit_completion(v_block.habit_id, v_date, v_amount, p_block_id);

  if v_block.completed_at is null then
    perform set_config('momentum.trusted', 'on', true);
    update public.calendar_blocks b
       set completed_at = now()
     where b.id = p_block_id
    returning * into v_block;
    perform set_config('momentum.trusted', 'off', true);
  end if;

  return v_block;
end;
$$;

comment on function public.complete_habit_block(uuid) is
  'Marks a habit block executed and records the habit completion for the block''s own local date, in one transaction. Exactly one completion however many times it is called (Domain Rules 13, 14).';

-- The reversal, and only of what completing did.
--
-- The completion row is removed only when it names *this* block as its source —
-- the block that created it. A day the user ticked on the habits page, or from
-- another block, is left alone: un-completing a block says the span was not
-- executed, and that is not the same statement as "the habit did not happen".
-- Erring toward keeping the record is the side Domain Rule 7 asks us to err on.
--
-- For an amount habit the block's own contribution is subtracted rather than the
-- row deleted, so a day of 30 minutes recorded as 15 + 15 loses 15.

create function public.uncomplete_habit_block(p_block_id uuid)
returns public.calendar_blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block  public.calendar_blocks;
  v_habit  public.habits;
  v_zone   text;
  v_date   date;
  v_amount integer;
  v_row    public.habit_completions;
begin
  select * into v_block from public.calendar_blocks b where b.id = p_block_id;
  if not found then
    raise exception 'calendar block % does not exist', p_block_id using errcode = 'P0002';
  end if;

  perform public.assert_caller(v_block.user_id);

  if v_block.kind <> 'habit' or v_block.habit_id is null then
    raise exception 'only a habit block records a habit completion, and % is a % block',
      p_block_id, v_block.kind
      using errcode = '22023',
            hint = 'Use uncomplete_block for events and work blocks.';
  end if;

  select * into v_habit from public.habits h where h.id = v_block.habit_id;
  select p.timezone into v_zone from public.profiles p where p.id = v_block.user_id;
  v_date := (v_block.start_at at time zone v_zone)::date;

  select * into v_row
    from public.habit_completions c
   where c.habit_id = v_block.habit_id
     and c.completion_date = v_date
     and c.source_block_id = p_block_id;

  if found then
    if v_habit.unit = 'minutes' then
      v_amount := greatest(1, (extract(epoch from (v_block.end_at - v_block.start_at)) / 60)::integer);
    else
      v_amount := 1;
    end if;

    if v_habit.frequency_type in ('amount_per_day', 'amount_per_week')
       and v_row.amount > v_amount then
      update public.habit_completions c
         set amount = c.amount - v_amount,
             source_block_id = null
       where c.id = v_row.id;
    else
      delete from public.habit_completions c where c.id = v_row.id;
    end if;
    -- The XP stays either way (Domain Rule 7).
  end if;

  if v_block.completed_at is not null then
    perform set_config('momentum.trusted', 'on', true);
    update public.calendar_blocks b
       set completed_at = null
     where b.id = p_block_id
    returning * into v_block;
    perform set_config('momentum.trusted', 'off', true);
  end if;

  return v_block;
end;
$$;

comment on function public.uncomplete_habit_block(uuid) is
  'Reverses complete_habit_block: clears the block and removes only the completion that block created. XP is never withdrawn (Domain Rule 7). Idempotent.';

-- ---------------------------------------------------------------------------
-- Exposure
-- ---------------------------------------------------------------------------
--
-- `20260906121200_grants.sql` revoked execute on everything in `public` and on
-- future functions by default, so a function is reachable over HTTP only when
-- its own phase says so. `habit_completion_id` is an internal helper of the
-- bodies above and is deliberately not among these.

grant execute on function public.record_habit_completion(uuid, date, integer, uuid) to authenticated;
grant execute on function public.remove_habit_completion(uuid, date)                to authenticated;
grant execute on function public.complete_habit_block(uuid)                         to authenticated;
grant execute on function public.uncomplete_habit_block(uuid)                       to authenticated;
