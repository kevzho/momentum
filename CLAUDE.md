# Momentum

Momentum is a scheduling-first, gamified personal productivity system.

**One core mechanic:** everything competes for the same finite resource — the user's week.
Tasks, habits, events, and focus sessions all resolve into time blocks on a weekly board,
and completing those blocks progresses the user's account.

Momentum is a productivity tool first and a game second.

---

## Before implementing substantial work

1. Read `docs/PRODUCT.md`.
2. Read `docs/ARCHITECTURE.md`.
3. Read `docs/DOMAIN_RULES.md` (and `docs/DATABASE.md` when touching data).
4. Read the relevant file under `specs/`.
5. Inspect the existing implementation before modifying it.
6. Check `docs/ROADMAP.md` for current phase status and known issues.

Do not implement phases beyond the one you were asked to implement.

---

## Core invariants

These are non-negotiable. Changing one requires updating `docs/DOMAIN_RULES.md`
in the same change, with a stated reason.

- **Due dates and scheduled work are different concepts.** A task due Friday may be
  worked on Monday, Tuesday, and Thursday.
- **A task may have multiple scheduled work blocks.** Never model this as a single
  `scheduled_start` / `scheduled_end` pair on the task.
- **Planned duration and actual duration are different concepts.** Estimates are user
  intent; actuals come from focus sessions and completion. Never overwrite one with the other.
- **All timestamps are stored in UTC.** The user's timezone lives on their profile.
  All date-boundary logic (what counts as "today", a habit's completion date, a week's
  start) resolves in the user's timezone, never the server's.
- **All user-owned data is protected by row-level security.** A user must never be able
  to read or modify another user's rows.
- **XP is never trusted from the client.** XP is computed server-side or in trusted
  database logic. The client may display it; it may not assert it.
- **Date/time logic lives in centralized utilities.** No ad-hoc date math in components.
- **Every drag interaction has a keyboard-accessible alternative.**
- **The web application is the canonical product.** Any desktop/native code wraps and
  extends the shared application; it never forks it.
- **Gamification rewards useful work and never punishes missed days.** No XP loss, no
  streak-destruction mechanics, no moralizing language.

---

## Engineering rules

- Preserve established architecture unless there is a concrete, stated reason to change it.
- Fix root causes instead of introducing workarounds.
- Never silently change database semantics. Schema changes ship as migrations.
- Prefer small reusable domain utilities over duplicated logic.
- Avoid unnecessary global state. Avoid unnecessary client components.
- Do not introduce a dependency when existing code can reasonably solve the problem.
- Do not replace a working subsystem merely because you prefer another library.

## Do not

- Weaken TypeScript types to make the compiler pass (`any`, `@ts-ignore`, `as unknown as`).
- Delete or skip failing tests to get green.
- Suppress errors instead of fixing them.
- Duplicate domain logic across packages.
- Leave a feature "complete" while lint, typecheck, or tests fail.

---

## Workflow for substantive work

```
inspect → plan → implement → test → typecheck → lint → review affected workflows
```

Before declaring a feature complete:

- `pnpm typecheck` exits 0
- `pnpm lint` exits 0
- `pnpm test` exits 0 for relevant suites
- the affected user workflow has been inspected end to end
- `docs/ROADMAP.md` is updated with the phase status and any new known issues

---

## Design constraints

The UI should read as a real funded productivity product: **calm, dense, fast, polished,
consistent.** See `docs/DESIGN_SYSTEM.md` for specifics.

Avoid the common failure modes: excessive rounded cards, decorative gradients, cartoonish
RPG chrome, glassmorphism, animation for its own sake, dashboard clutter, duplicate page
headers, arbitrary one-off colors.

Simplify rather than adding decoration.

---

## Repo map

```
CLAUDE.md          engineering constitution (this file)
AGENTS.md          same rules, for non-Claude agents
docs/              durable knowledge — true across all phases
specs/             per-phase implementation specifications
apps/web/          Next.js application (canonical product)
apps/desktop/      Tauri shell (post-MVP; loads the deployed web app)
packages/core/     framework-free domain: types, time, recurrence, scheduling, …
packages/db/       generated database types, mappers, repositories
packages/ui/       design-system primitives (shadcn base + Momentum layer)
supabase/          migrations and seed data; trusted logic is SQL in migrations
```

Architecture boundaries are lint-enforced (`eslint.config.mjs`): data access only in
`features/*/queries.ts`, `features/*/actions.ts`, and `lib/supabase`; no `date-fns` or
`new Date()` in components; `core` and `db` are framework-free; `ui` never imports Next.
