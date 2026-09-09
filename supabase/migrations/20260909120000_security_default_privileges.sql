-- Momentum — security hardening: close the default-privilege boundary for good.
--
-- Two latent holes the audit (2026-09-09) confirmed against the live stack. Both
-- are dormant today — every function in `public` is clean and no sequence exists
-- — but each is a guarantee the docs already claim and the database does not yet
-- keep, and each would open silently the moment a later migration adds a
-- function or a `serial`/identity column.
--
-- ---------------------------------------------------------------------------
-- 1. Functions are born PUBLIC-executable.
-- ---------------------------------------------------------------------------
--
-- `20260906121200_grants.sql` tried to shut this with
--
--   alter default privileges in schema public revoke execute on functions
--     from public, anon, authenticated;
--
-- but a *per-schema* default-privilege entry is added on top of the built-in
-- default (functions: EXECUTE to PUBLIC) and can only undo a matching per-schema
-- GRANT — it can never subtract the built-in one. So every function created
-- afterwards still carried `=X/postgres` (PUBLIC execute). Phase 3 and Phase 8
-- both noticed and patched the symptom with by-name revokes over the functions
-- that existed at the time; the cause stayed in place.
--
-- Verified live in a rolled-back transaction as the migration role:
--   create function public.zz_probe() returns int language sql as 'select 1';
--   -- proacl => {=X/postgres,postgres=X/postgres,service_role=X/postgres}
--   set local role authenticated; select public.zz_probe();  -- 1  (reachable!)
-- and end to end: a freshly created `public.zz(p_user_id uuid, p_amount int)`
-- with no grant answered POST /rest/v1/rpc/zz 200 for the anon key.
--
-- The fix is the GLOBAL (schema-less) form, which *does* override the built-in
-- default for objects the migration role creates. After it, a new function gets
-- `{postgres=X/postgres,service_role=X/postgres}` and both `anon` and
-- `authenticated` get `permission denied`. The by-name grant list in the phase
-- migrations remains the single source of truth for what IS reachable; this only
-- makes "nothing else is" true by construction instead of by remembering.

alter default privileges for role postgres revoke execute on functions from public;

-- Belt and suspenders: the per-schema form as well, so the intent is stated in
-- both shapes and a reader sees the guarantee whichever they inspect.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sequences default to `authenticated` USAGE/SELECT/UPDATE.
-- ---------------------------------------------------------------------------
--
-- `20260906121200_grants.sql:15` revoked default sequence privileges from `anon`
-- only; Supabase's per-schema grant to `authenticated` (rwU on future sequences)
-- was never reversed. No sequence exists today (every PK is a uuid), so there is
-- nothing exposed — but a future `serial`/identity column would let any signed-in
-- caller `nextval`/`setval` it over PostgREST. This is a per-schema grant, so a
-- per-schema revoke is the correct and sufficient undo.

alter default privileges for role postgres in schema public
  revoke all on sequences from authenticated;
revoke all on all sequences in schema public from authenticated;
