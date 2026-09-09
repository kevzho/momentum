-- Momentum — the XP ledger.
--
-- Append-only. Rows are never updated or deleted: XP is never lost and never
-- negated (Domain Rules 6, 7, 15). The partial unique index is the idempotency
-- guarantee — completing, un-completing and re-completing a task cannot mint
-- XP twice, because the second award collides on (user, source_type, source_id).
--
-- No foreign key on source_id: the ledger outlives its sources. A deleted task
-- does not erase the XP it earned.

create table public.xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  source_type public.xp_source not null,
  source_id   uuid,
  amount      integer not null,
  reason      text not null,
  created_at  timestamptz not null default now(),

  constraint xp_events_amount_chk check (amount > 0)
);

comment on table public.xp_events is
  'Append-only XP ledger. Written only by security definer functions; the client may read it and nothing else.';
comment on column public.xp_events.reason is
  'Human-readable, e.g. Completed "History essay". Never moralising (Domain Rule 7).';

create unique index xp_events_source_uniq
  on public.xp_events (user_id, source_type, source_id)
  where source_id is not null;
-- Daily caps, history, reconciliation.
create index xp_events_user_created_idx on public.xp_events (user_id, created_at);

-- Select only, and no update or delete policy for anyone: append-only is
-- enforced by the absence of a policy, not by convention.
alter table public.xp_events enable row level security;

create policy "xp_events: select own"
  on public.xp_events for select to authenticated
  using (user_id = (select auth.uid()));
