# supabase

`config.toml` — the local stack's configuration, checked in. `site_url` and
`additional_redirect_urls` are what the auth emails link back to; the minimum password
length here and in `features/auth/schemas.ts` are deliberately the same number.

`migrations/` — every schema change, in filename order, including the `security definer`
functions that hold all trusted logic (XP, completion, focus lifecycle, quests). Nothing is
configured only in the dashboard. The table of migrations and what each contains is in
`docs/DATABASE.md`.

`seed.sql` — the development seed, applied by `pnpm db:reset`. Two accounts:
`demo@momentum.test` (populated) and `second@momentum.test` (the neighbour the RLS suite
proves cannot see any of it), both with the password `momentum123`. Everything is relative
to `now()`, so the seed never goes stale.

There is no `functions/` directory: Phase 0 chose Postgres functions over Edge Functions
for trusted logic (`docs/ARCHITECTURE.md` §12).

## Commands

```
pnpm db:start     supabase start            # Docker
pnpm db:reset     supabase db reset         # migrations + seed, from scratch
pnpm db:types     regenerate packages/db/src/database.types.ts (and format it)
pnpm test:db      the RLS and signup suites against the local stack
pnpm db:stop
```

The schema is designed in `docs/DATABASE.md`. RLS is enabled on every user-owned table. No
exceptions — and `packages/db/tests/rls.test.ts` proves it for every table, not just the
ones the UI reaches today.
