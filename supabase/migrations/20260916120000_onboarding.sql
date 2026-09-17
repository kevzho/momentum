-- Momentum — first-run onboarding state on the profile.
--
-- Two nullable stamps, both owned by the user (plain `update own` under the
-- existing RLS policy; neither is guarded, since neither is a reward).
--
--   working_hours_set_at    when the user last saved working hours. The
--                           column default is Mon–Fri 09:00–17:00, so "has
--                           the user set their hours" cannot be read off the
--                           hours themselves. Stamped by the settings write.
--   onboarding_dismissed_at when the first-run checklist finished (all three
--                           steps done) or was skipped. Once set, the
--                           checklist never returns.
--
-- The other two steps — three tasks captured, one work block scheduled — are
-- read from `tasks` and `calendar_blocks`, not stored.

alter table public.profiles
  add column working_hours_set_at    timestamptz,
  add column onboarding_dismissed_at timestamptz;

comment on column public.profiles.working_hours_set_at is
  'When working hours were last saved by the user; null means the defaults have never been confirmed.';
comment on column public.profiles.onboarding_dismissed_at is
  'When the first-run checklist finished or was skipped. Null shows it; it never returns once set.';

-- Every account that exists before this migration has already found its way
-- around; the checklist is for accounts created from here on.
update public.profiles set onboarding_dismissed_at = now();
