-- Momentum — table privileges.
--
-- RLS is the row gate; these grants are the column-and-verb gate in front of
-- it. Supabase's default privileges grant everything in `public` to `anon` and
-- `authenticated`, which would leave the ledger and lifecycle tables writable
-- by any policy that later appeared. Stating the matrix explicitly means the
-- table privileges and docs/DATABASE.md's RLS matrix agree line for line, and
-- a table added without a decision has no access at all.

-- `anon` reaches nothing. Momentum has no public surface.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Start from nothing for `authenticated` too, then grant the matrix.
revoke all on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from authenticated;

-- Functions default to `execute` for PUBLIC, which would make every helper a
-- PostgREST endpoint. Close that and re-open only what a trigger running as the
-- caller actually has to call.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Read-write, owner-scoped by policy.
grant select, insert, update, delete on public.projects        to authenticated;
grant select, insert, update, delete on public.tasks           to authenticated;
grant select, insert, update, delete on public.calendar_blocks to authenticated;
grant select, insert, update, delete on public.habits          to authenticated;
grant select, insert, update, delete on public.weekly_goals    to authenticated;
grant select, insert, update, delete on public.weekly_reviews  to authenticated;

-- Read and update own settings; xp, level and coins are guarded columns.
grant select, update on public.profiles to authenticated;

-- Read-only: written by trusted functions (Domain Rule 15).
grant select on public.habit_completions to authenticated;
grant select on public.focus_sessions    to authenticated;
grant select on public.focus_pauses      to authenticated;
grant select on public.xp_events         to authenticated;
grant select on public.user_achievements to authenticated;
grant select on public.quest_assignments to authenticated;

-- Cosmetics: buying is a trusted function, equipping is an ordinary update.
grant select, update on public.user_cosmetics to authenticated;

-- Reference data.
grant select on public.achievement_definitions to authenticated;
grant select on public.quest_definitions       to authenticated;
grant select on public.cosmetic_definitions    to authenticated;

-- The guard and validation triggers are `security invoker`, so these three
-- helpers are called as the signed-in role and need `execute`. Everything else
-- in `public` returns `trigger` and is unreachable over HTTP. The trusted
-- business-logic functions arrive with the phases that own them and grant
-- `execute` one at a time.
grant execute on function public.is_trusted()                      to authenticated;
grant execute on function public.is_valid_timezone(text)           to authenticated;
grant execute on function public.reject_guarded_write(text, text)  to authenticated;
