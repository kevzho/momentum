# Momentum — security audit findings (2026-09-09)

Full audit of RLS coverage and correctness, mutation authorization on every path, server-side
XP integrity and farm resistance, secret exposure in the client bundle, unsafe user-input
handling, and any path by which one user's data could reach another.

**Method.** Four parallel auditors with non-overlapping ownership (database access control;
XP/economy integrity; app authorization and input; secrets and platform) each read the
migrations and source and then reproduced every candidate finding against a running local
Supabase. A fifth worker authored the cross-user proof suite. Every non-trivial finding was
then independently re-verified by a separate skeptical worker against the live stack. Nothing
here is "we added a policy" — each finding was reproduced before fixing and each fix
re-verified the same way.

**Result.** RLS is airtight across all 17 tables; no granted function accepts a client XP or
coin amount; the client bundle carries no secret. The economy had one high-severity farm and
a second high-severity cap bypass, both reproduced live, plus several medium/low issues. All
confirmed security-material issues are fixed; the remaining low items are documented as
accepted risk with reasons. `pnpm typecheck`, `pnpm lint`, `pnpm test` and the database suite
(`MOMENTUM_DB_TESTS=1`, 451 tests) all pass from a clean `db:reset`.

---

## Proof, not assertion

- `packages/db/tests/rls-cross-user.test.ts` — 122 cases. A second signed-in account (and a
  signed-out one) attempts every cross-user operation and is refused with the exact SQLSTATE,
  and every mutation attempt is followed by a read as the row's owner proving no state changed:
  insert with another user's `user_id`; transfer an own row to another account; point an own
  foreign key at another account's row (task, habit, project, parent task, series override);
  call every sanctioned RPC with another user's id; reach the ungranted functions; read another
  user's rows through a resource embed on a shared definition table; count/id side channels;
  create a row already in a guarded state; write the client-read-only tables; and every granted
  function signed out.
- `packages/db/tests/security-hardening.test.ts` — runs the three economy attacks (cap reset by
  timezone, weekly-goal farm, quest multiplication) and shows they now fail.
- `packages/db/tests/rls.test.ts` and `gamification.test.ts` (pre-existing) continue to pass.

---

## Findings

Severity: **critical** = cross-user read/write or unbounded mint · **high** = a farm with real
yield or an auth bypass · **medium** = bounded farm / latent boundary hole · **low** = hardening.

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | high | **Weekly-goal XP/coin farm.** `weekly_goals.week_start` was client-chosen and unconstrained; the award is keyed on `(user, week_start, metric)`. A client could POST one goal per calendar *date* per metric (overlapping 7-day windows over the same work) or backfill every past week, then claim each for a flat 50 XP + 20 coins — uncapped. Reproduced: a neighbour minted +50 XP / +20 coins per claim across consecutive dates. | **Fixed** |
| 2 | high | **Daily XP cap reset by timezone.** The per-source daily cap counted awards in a calendar day resolved in the client-writable `profiles.timezone`. Switching to a timezone whose midnight had just passed made earlier awards "yesterday" and reopened the full cap — ~30x the intended amount across tasks, habits and focus. | **Fixed** |
| 3 | medium | **Quest multiplication.** `ensure_quest_assignments` derived the period from `profiles.timezone`/`week_start`; sweeping them spawned up to 14 weekly and 9 daily assignments whose windows all covered the same work, each claimable. | **Fixed** |
| 4 | medium | **Cap check-then-insert race.** `cap_xp_event` read the day's sum with no per-user lock, so concurrent awards all passed an under-cap check and overshot. | **Fixed** |
| 5 | medium | **Latent function exposure.** The per-schema `alter default privileges … revoke execute` never removed the built-in `PUBLIC EXECUTE`, so any function a future migration adds is born callable by `anon`/`authenticated` over `/rest/v1/rpc`. Reproduced end to end with a throwaway function; no function is exposed today. | **Fixed** |
| 6 | medium | **Sign-up account enumeration.** `signUp` forwarded GoTrue's "User already registered" verbatim, revealing which emails have accounts (while `signIn`/`requestPasswordReset` are careful not to). | **Fixed** |
| 7 | low | **Session cookies lacked `HttpOnly`/`Secure`** (library defaults; the app has no browser client, so it is defence in depth). | **Fixed** |
| 8 | low | **`created_at` client-writable** on every table (own rows only; audit-trail integrity). | **Fixed** |
| 9 | low | **Default sequence privileges** still granted to `authenticated` (latent; no sequence exists). | **Fixed** |
| 10 | low | **Weekly-goal target had no DB upper bound** (enforced only by zod). | **Fixed** |
| 11 | low | **Tasks action forwarded raw database messages** on an unmapped SQLSTATE (internal wording disclosure). | **Fixed** |
| 12 | low | **No baseline security headers** (CSP frame-ancestors, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS) and `X-Powered-By` left on. | **Fixed** (headers added; full script-src CSP deferred — see below) |
| 13 | low | **`/update-password` requires no reauthentication** — a live session can change the password. | Accepted risk |
| 14 | low | **Trusted RPCs distinguish `42501` ("not yours") from `P0002` ("no such row")** — an existence oracle for a uuid the caller already holds. | Accepted risk |
| 15 | low | **`profiles.working_hours`/`focus_windows` shape validated only by the app** — a direct write can corrupt the writer's own account (self-DoS). | Accepted risk |
| 16 | low | **Habit-completion ±1-day window is in the client timezone** (widenable to ±2); neutralised for XP by the rolling cap. | Accepted risk |
| 17 | low | **`config.toml`/`seed.sql` are dev-shaped** (confirmations off, localhost redirects, seed accounts with a public password, no production guard). | Accepted risk (deployment) |
| — | info | Bundle secret scan clean; `pnpm audit` clean; bulk actions bounded; `/version` exposes only the build stamp; client-generated ids are crypto-random. | No action |

---

## Fixes

Five migrations (`supabase/migrations/20260909120*`) and four application edits.

- **Weekly goals** (`…_security_weekly_goals.sql`): `guard_weekly_goals` now requires
  `week_start` to be the caller's current local week and freezes `week_start`/`metric`/`target`
  after creation; `weekly_goals_target_cap_chk` mirrors `QUEST_TARGET_CAPS.weekly`. The guard
  constrains the `authenticated` client only; trusted logic, the seed and admin fixtures set
  arbitrary weeks deliberately (as the seed already does via the trusted flag), and a cross-user
  insert falls through to the row-level `with check` (42501).
- **XP caps** (`…_security_xp_caps.sql`): `cap_xp_event` and the inline focus cap use a rolling
  24-hour window (`created_at > now() - interval '24 hours'`) — independent of any client
  setting and strictly not weaker than a calendar day — under a per-user row lock that closes
  the race. This changes the "capped per local day" wording of Domain Rule 6/§20; the reason is
  recorded in `docs/DOMAIN_RULES.md` §21.
- **Quests** (`…_security_quest_multiplication.sql`): `quest_assignments` gains a `timezone`
  column; `assign_quests` records it and refuses to create a set whose window (in the timezone
  it was assigned in) overlaps one the user already holds. Every reachable "current" period
  overlaps `now()`, so at most one set per kind survives a sweep.
- **Default privileges** (`…_security_default_privileges.sql`): the global
  `alter default privileges for role postgres revoke execute on functions from public` removes
  the built-in default so future functions are born unreachable; sequence privileges revoked
  from `authenticated`.
- **`created_at`** (`…_security_freeze_created_at.sql`): a `freeze_created_at` trigger stamps it
  on insert and holds it immutable, except for trusted logic (the seed backdates history).
- **App**: `signUp` returns the same reply for an existing address as a fresh one
  (`features/auth/actions.ts`); `createSupabaseServerClient` and the proxy set
  `httpOnly`/`secure`/`sameSite` cookie options; `next.config.ts` adds baseline headers and
  `poweredByHeader: false`; the tasks action's unmapped-error branch returns a fixed message.

Docs updated: `docs/DOMAIN_RULES.md` (§21, the invariant changes with reasons),
`docs/DATABASE.md` (the corrected default-privileges account, the new migrations and columns),
`docs/ROADMAP.md` (the audit summary and the accepted-risk list).

---

## Accepted risk (confirmed, low, left with a reason)

- **Full `script-src` CSP** needs a per-request nonce threaded through `proxy.ts` to cover
  Next's and next-themes' inline scripts without `unsafe-inline`; only `frame-ancestors 'none'`
  ships now. Follow-up.
- **`/update-password` reauthentication**: gating it to recovery-scoped sessions risks breaking
  the legitimate recovery flow; left as a follow-up.
- **`42501` vs `P0002` RPC oracle**: low value (needs a uuid the caller already holds, leaks no
  content); unifying the codes would churn ~15 call sites and the RLS suite.
- **`profiles` JSON shape**: a direct PostgREST write can store malformed working-hours/focus
  windows, harming only the writer's own account; the app validates on the write path.
- **Habit ±1-day window**: tightening it risks rejecting legitimate near-midnight completions;
  the rolling cap already removes its XP value.
- **Deployment config**: production must enable email confirmations, set the real
  `site_url`/redirect URLs, and never run the seed or `db reset --linked` against a hosted
  project. These depend on production values not in the repo.

---

## How to re-verify

```
pnpm typecheck && pnpm lint && pnpm test          # app + domain, DB tests skip cleanly
pnpm db:reset                                       # build the schema from migrations + seed
MOMENTUM_DB_TESTS=1 pnpm exec vitest run --project db   # 451 tests incl. the cross-user + anti-farm proofs
```
