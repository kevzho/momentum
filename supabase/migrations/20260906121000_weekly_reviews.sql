-- Momentum — weekly reviews (Phase 14).
--
-- Prompts only. Every number a review displays is derived from the Phase 10
-- aggregations at read time and is deliberately not stored here, so a review
-- can never contradict the data it reflects on.

create table public.weekly_reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  week_start        date not null,
  went_well         text,
  got_in_the_way    text,
  change_next_week  text,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index weekly_reviews_uniq on public.weekly_reviews (user_id, week_start);

create trigger weekly_reviews_set_updated_at
  before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

alter table public.weekly_reviews enable row level security;

create policy "weekly_reviews: select own"
  on public.weekly_reviews for select to authenticated
  using (user_id = (select auth.uid()));

create policy "weekly_reviews: insert own"
  on public.weekly_reviews for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "weekly_reviews: update own"
  on public.weekly_reviews for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "weekly_reviews: delete own"
  on public.weekly_reviews for delete to authenticated
  using (user_id = (select auth.uid()));
