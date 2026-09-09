# Phase 2 — Database & Auth

**Model:** Opus 5 · **Effort:** xhigh

## Objective

Implement the persistent data layer and authentication. After this phase the app has real
accounts, a real schema with enforced row-level security, a clean data access layer, and
seed data for development.

## Read first

`docs/DATABASE.md` (the schema designed in Phase 0 — implement *that*, don't redesign it)
and `docs/DOMAIN_RULES.md`.

## User stories

- I can sign up, sign in, and sign out.
- My session persists across reloads.
- My data is mine — no other account can read or modify it, even with a crafted request.
- As a developer, I can load realistic seed data with one command.

## Requirements

### Auth

Supabase Auth. Email/password at minimum; add OAuth only if it costs nothing extra.

- Signup, login, logout, password reset
- Route protection — unauthenticated users reaching app routes are redirected
- A `profiles` row created automatically on signup, with a timezone captured or detected
- Session handling correct in both server components and client components

### Migrations

Implement every table in `docs/DATABASE.md` as migrations. Nothing configured only in the
Supabase dashboard.

Standing requirements (also in `docs/DATABASE.md`):

- UUID primary keys
- `timestamptz` stored UTC; `date` for calendar-date concepts like habit completion dates
- Foreign keys with deliberate `on delete` behavior per relationship
- Check constraints encoding real invariants: `end_at > start_at`, non-negative durations,
  valid enum values
- Indexes for real access patterns — `(user_id, …)` everywhere, plus range indexes for the
  calendar's start/end window queries

### Row-level security

**RLS enabled on every user-owned table**, including join and progress tables.
Policies scoped to `auth.uid()`. A missing policy is a security bug even if no UI reaches it.

Write tests that attempt cross-user reads and writes and assert they fail. Not "we added
policies" — proof.

### Types and data access

- Generate TypeScript types from the schema; check them in; document the regeneration command
- Build the repository/data-access layer designed in Phase 0
- **No Supabase queries inside UI components.** This is the rule that keeps every later
  phase clean; enforce it now with a lint rule if practical

### Seed data

A dev seed that produces a realistic account: several projects, tasks across every status
and priority, tasks with and without due dates, tasks with multiple work blocks, calendar
events including overlapping ones, habits of each frequency type, partial habit weeks, and
weeks of historical focus sessions so Phase 10's analytics have something to chart.

Seed data is a testing asset. Make it good; the alternative is discovering edge cases in
production.

### Documentation

Update `docs/DATABASE.md` so it matches the shipped migrations exactly. Document RLS
assumptions, cascade reasoning, index justification, timezone handling, and the migration +
type-generation workflow.

## Acceptance criteria

- [ ] Migrations apply cleanly to an empty database
- [ ] Signup, login, logout, and password reset all work
- [ ] A profile row is created on signup with a valid IANA timezone
- [ ] Protected routes redirect unauthenticated users
- [ ] RLS is enabled on every user-owned table
- [ ] Automated tests prove a second user cannot read or write the first user's rows
- [ ] Generated types are checked in and match the schema
- [ ] No Supabase query exists inside a UI component
- [ ] Seed data loads and covers the cases listed above
- [ ] All timestamps store UTC; habit dates store as `date`
- [ ] `docs/DATABASE.md` matches the migrations
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: the calendar UI, task UI, XP calculation logic (schema only), realtime
subscriptions, Google Calendar sync, or team/sharing features.
