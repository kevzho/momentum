# Momentum — Roadmap

**This file is the single source of truth for where the project is.**
Every phase updates it before declaring completion. A fresh context reads
`CLAUDE.md` → this file → the relevant spec, and knows exactly what to do.

Last updated: 2026-09-09 (Phase 13 — final product-quality audit — **complete**. All 18
workflows inspected in a real browser before any fix, 78 findings recorded (2 P0 · 30 P1 ·
46 P2), every P0 and P1 fixed, 44 P2 fixed and 2 recorded; a Playwright suite now walks the
18 workflows (`pnpm test:e2e`). Green on the integrated tree: typecheck, lint, 2861 tests
under `MOMENTUM_DB_TESTS=1` (2500 unit/component + the 361-case database suite of RLS
cross-user proofs and anti-farm attacks, on a freshly seeded database), all 18 e2e specs, a
cold production build, and a client bundle with no secret pattern in it. Getting there took
a Docker workaround — the CLI's kong container wedges the daemon on this host — recorded
under "Current known issues". See "What exists after Phase 13". The morning's security
sweep is the entry below.)

Earlier the same day: (Phase 13 security audit — RLS/authorization/XP-integrity/secrets
sweep; confirmed farms and hardening gaps fixed and proved with cross-user and anti-farm
integration tests. See "Security audit" below.)

Previously: 2026-09-08 (Phase 12 — PWA and installability — complete: typecheck, lint, a clean production build and 2385 unit and component tests. **Driven in a real browser this time**, over the DevTools protocol against production builds on localhost: Chrome's own manifest parser reports no errors and `Page.getInstallabilityErrors` is empty; the worker installs, activates and caches no HTML; a navigation with the network cut serves the designed offline page in both themes; a tab left open across a real deploy is offered the new build and lands on it; `theme-color` follows a chosen theme against the opposite OS setting; and the safe-area padding was measured with iPhone insets injected through CDP. Not done: an install on macOS Safari or iOS Safari, and a Lighthouse run — see the known issues.)

---

## Status legend

`NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `COMPLETE`

---

## MVP scope (v0.1)

Phases 0–4 and 9 constitute the MVP: weekly calendar, task inbox, drag-to-schedule,
duration estimates, Today/Next Up, Pomodoro linked to tasks, XP + levels.
Everything else is post-MVP. Ship the MVP before starting Phase 5.

---

## Phases

| #   | Phase                            | Spec                          | Status      |
| --- | -------------------------------- | ----------------------------- | ----------- |
| 0   | Foundation & architecture        | `specs/00-foundation.md`      | COMPLETE    |
| 1   | App shell & design system        | `specs/01-app-shell.md`       | COMPLETE    |
| 2   | Database & auth                  | `specs/02-database-auth.md`   | COMPLETE    |
| 3   | Weekly calendar                  | `specs/03-weekly-calendar.md` | COMPLETE    |
| 4   | Task manager                     | `specs/04-task-manager.md`    | COMPLETE    |
| 5   | Week planning & Find Time        | `specs/05-week-planning.md`   | COMPLETE    |
| 6   | Habits                           | `specs/06-habits.md`          | COMPLETE    |
| 7   | Focus mode                       | `specs/07-focus-mode.md`      | COMPLETE    |
| 8   | Gamification                     | `specs/08-gamification.md`    | COMPLETE    |
| 9   | Today page                       | `specs/09-today.md`           | COMPLETE    |
| 10  | Analytics                        | `specs/10-analytics.md`       | COMPLETE    |
| 11  | Command palette & quick add      | `specs/11-command-palette.md` | COMPLETE    |
| 12  | PWA & installability             | `specs/12-pwa.md`             | COMPLETE    |
| 13  | Final audit                      | `specs/13-final-audit.md`     | COMPLETE    |
| 14  | Weekly review _(post-MVP)_       | `specs/14-weekly-review.md`   | NOT STARTED |
| 15  | Desktop / Tauri _(post-MVP)_     | `specs/15-desktop-tauri.md`   | NOT STARTED |

Integration audits run after Phase 5 and again before Phase 13. All prompts: `docs/PROMPTS.md`.

---

## What exists after Phase 0

- A running pnpm-workspace scaffold: `apps/web` (Next 16.3.4, React 19.2, TypeScript
  6.0.3, Tailwind 4, shadcn `radix-nova` initialized), `packages/core` (domain types),
  `packages/db` (placeholder for Phase 2), `packages/ui` (tokens baseline + `Button`).
- Root commands, all green: `pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint`
  · `pnpm test` (one trivial test in `packages/core`).
- `docs/ARCHITECTURE.md`: all fifteen decisions with rationale and rejected alternatives,
  resolved versions, decisions log, risk register, and the spec/architecture conflict table.
- `docs/DATABASE.md`: every table, column, type, constraint, index, foreign-key cascade,
  trusted function, and the RLS matrix.
- `docs/DESIGN_SYSTEM.md`: token scales and the primitive list Phase 1 implements.
- `docs/DOMAIN_RULES.md`: Rules 13–18 added (block model and completion semantics, habit
  completion uniqueness, trusted writes, recurrence wall-clock semantics, client ids,
  desktop = remote content).
- Lint-enforced architecture boundaries in `eslint.config.mjs` (no Supabase or `@momentum/db`
  outside `queries.ts` / `actions.ts` / `lib/supabase`; no `date-fns` or `new Date()` in
  components; framework-free `core` and `db`; Next-free `ui`).

## What exists after Phase 1

- **The shell.** `app/(app)/layout.tsx` renders `AppShell`: a 240/56px collapsible rail, a
  top bar, and the routed view, at exactly the viewport height with only `<main>`
  scrolling. Collapse state persists in a cookie the server reads, so the first paint is
  the right width. Below `md` the rail is replaced by a drawer driven by the same
  navigation registry (`lib/nav.ts`), so a route cannot appear in one and not the other.
- **All seven routes** — `/today` `/calendar` `/tasks` `/habits` `/focus` `/analytics`
  `/settings` — with realistic static placeholders from `lib/placeholder-data.ts`, a
  `loading.tsx` skeleton built from the same layout components, and error boundaries at
  root, content-area and (for calendar and tasks) route granularity.
- **The design system.** Full token layer in `packages/ui/src/styles/globals.css`; every
  shadcn base component; the Momentum primitives (see `docs/DESIGN_SYSTEM.md` for the four
  that are deliberately deferred). Every project-palette `fg` on `bg` pair and every
  semantic foreground/background pair was verified at ≥ 4.5:1 in both themes.
- **Verified in a headless browser** at 1440 and 375, in both themes: all seven routes
  render with exactly one `h1` and zero console errors; horizontal page overflow is 0px on
  every route at 375 (the 616px week grid scrolls inside its own container); the theme
  class is on `<html>` before the document finishes parsing and the choice survives reload;
  sidebar collapse survives reload at 56px and 240px; every keyboard tab stop shows a
  visible focus ring; `prefers-reduced-motion` zeroes all three duration tokens.
- **Layout shift from skeleton to content, measured by holding the RSC payload:** 0px on
  every axis for `/tasks`, `/analytics`, `/habits`, `/focus` and `/calendar`. `/settings`
  is 1px taller in total (the `Switch` is 18.4px and the nearest skeleton step is 18px);
  nothing above it moves.
- `pnpm typecheck` · `pnpm lint` · `pnpm test` (17 tests) · `pnpm build`, all green.

### Notes for Phase 2

- The shell is ready for `requireSession()`: `app/(app)/layout.tsx` is already async and
  cookie-dependent. Add the profile read there and pass it into a `UserSettingsProvider`.
- Delete `apps/web/src/lib/placeholder-data.ts` as each feature gains its `queries.ts`.
  Nothing else imports placeholder data, and nothing in it performs date arithmetic — the
  times and dates are pre-formatted strings precisely so they cannot become a source of
  ad-hoc date logic.
- `@momentum/core/time` does not exist yet. Phase 1 needed no date maths at all; Phase 3
  builds the module specified in `docs/ARCHITECTURE.md` §10, and `DurationInput` and
  `DatePicker` (Phase 4) depend on it.

## What exists after Phase 2

- **The schema, as thirteen migrations.** Every table, enum, constraint, index, trigger and
  policy in `docs/DATABASE.md`, applied in filename order and each file one concern.
  Nothing is configured only in the dashboard; `supabase/config.toml` is checked in.
- **Row-level security on every user-owned table**, with the four `own` policies where the
  matrix says so and no policy at all where it says "—". Table and function privileges are
  granted explicitly by the last migration, and the *default* privileges for future objects
  are revoked, so a table added by a later phase starts with no access until someone
  decides otherwise.
- **Guarded columns work today.** `profiles.xp/level/coins`, `tasks.status/completed_at/
  actual_minutes`, `calendar_blocks.completed_at`, `weekly_goals.completed_at` and
  `user_cosmetics`' ownership columns are refused to any client that has not set the
  transaction-local trusted flag — which nothing but a `security definer` function can do.
  Archiving a task is deliberately exempt, because it never touches completion.
- **Cross-table ownership** is enforced by one generic `assert_same_owner()` trigger taking
  (column, table) pairs, so a crafted request cannot attach a block to another account's
  task even though RLS would let it read nothing back.
- **Auth.** Signup, sign-in, sign-out and password reset as server actions over `FormData`,
  so every form works before hydration; `proxy.ts` refreshes the session on each navigation
  and redirects; `requireSession()` is the real check and is `cache()`d per request. A
  profile row is created by a trigger on `auth.users`, with the browser timezone the signup
  form suggested, validated against Postgres's own timezone database and falling back to
  UTC rather than failing the signup.
- **`@momentum/core/time`** exists as its first slice: the branded scalar constructors
  (`instant`, `localDate`, `localTime`, `ianaTimeZone`) with the ISO normalisation the
  mappers need. Domain Rule 5 says date logic lives in one module, and normalising a
  database timestamp is date logic. Phase 3 adds the timezone and boundary functions.
- **`@momentum/db`** — generated types, row↔domain mappers for every table, the `profiles`
  repository, and compile-time enum parity against `@momentum/core/types`.
- **Proof, not assertion.** `packages/db/tests/rls.test.ts` walks all fourteen user-owned
  tables as two signed-in accounts and asserts the second can neither read nor write the
  first's rows, plus the ledger tables' refusals, the guarded columns, the ownership
  triggers, and that a signed-out client reaches nothing. It first establishes that *both*
  accounts have rows in every one of those tables, because "an unscoped select returns only
  my own rows" is vacuously true of a table I have no rows in. `signup.test.ts` covers the
  profile trigger, including the invalid-timezone fallback. 154 assertions, and both files
  skip themselves without `MOMENTUM_DB_TESTS=1`, so `pnpm test` stays green without Docker.
- **A seed worth testing against**: two accounts, 44 tasks, a task with three work blocks,
  three overlapping events, a series with an override and a cancellation, every habit
  frequency with real gaps, and eight weeks of focus history — all relative to `now()`.

### Verified against a running database

The stack this phase was written against finally ran, and everything above was checked
rather than asserted:

1. `pnpm db:reset` — the thirteen migrations apply to an empty database and the seed loads,
   repeatedly and from scratch.
2. `pnpm db:types` — `packages/db/src/database.types.ts` is now the generator's output, not
   the hand-written placeholder. The placeholder was accurate: regenerating it changed no
   table, column or enum, and `pnpm typecheck` passed against the real file unmodified.
3. `pnpm test:db` — 154 assertions, all green, none skipped.
4. Signup → sign-out → sign-in → password reset walked end to end against the dev server:
   both the hydrated path and the pre-hydration form post, the reset email fetched from
   Mailpit and its recovery link followed, the new password accepted and the old one
   refused, and sign-out driven through the account menu in real Chrome with no console
   errors.

**Three defects only a running database could surface, all fixed here:**

- **The seed's accounts could not sign in.** Rows inserted straight into `auth.users` left
  `confirmation_token`, `recovery_token`, `email_change` and `email_change_token_new` null;
  GoTrue scans those into non-nullable strings and answers every sign-in with `Database
  error querying schema`. They are `''` now (`supabase/seed.sql`, `docs/DATABASE.md`).
- **Signup failed before hydration.** The signup form's hidden `timezone` input is empty
  until client JavaScript fills it from `Intl`, and the action fed that `""` to a schema
  that requires a non-empty string — so a form submitted before hydration was rejected for
  a field the user never sees, instead of starting the profile at UTC as the trigger
  intends. `optionalField()` in `features/auth/actions.ts` now reads an untouched input as
  absent, which is what HTML means by it.
- **The seed's XP disagreed with its own ledger** by 50, because awards are inserted by
  three blocks and the profile total was written by the first. It is reconciled once, at
  the end of the file. The neighbour account was also missing rows in five tables, which
  made five of the RLS suite's "returns only the neighbour's own rows" assertions vacuous;
  it has a row in every table now, and the suite asserts that before it asserts any leak.

## What exists after Phase 3

- **The domain layer the calendar is built on**, as three pure modules in `@momentum/core`,
  all of them run twice — once under `TZ=UTC` and once under `TZ=America/Los_Angeles` —
  so a function that reads the process timezone instead of taking one fails:
  - **`time`** is now the full module of `docs/ARCHITECTURE.md` §10: `fromLocal` (forward
    through a DST gap, first occurrence in an overlap), `splitByLocalDay`, `weekOf`,
    `weekRange`, the formatters, and the `LocalTime` ↔ minutes pair.
  - **`calendar`** is the grid geometry: pixel ↔ minute, snapping, clamping, drop and
    resize resolution, and an interval sweep that lays overlapping blocks out side by side.
    It imports nothing from `time` — it is pixels and wall-clock minutes only, which is
    what makes it exhaustively testable without a timezone database.
  - **`recurrence`** expands a series for a window and applies overrides, keeping the
    series' wall-clock time across a DST transition (Domain Rule 16).
- **The board.** `/calendar` renders seven day columns (or one, in day view) from
  `?week=&view=`, with a time gutter, hour lines, an all-day strip, a current-time
  indicator on today's column, and blocks positioned by the geometry above. Overlapping
  blocks share a cluster width; a block crossing midnight renders in both columns.
- **Every interaction in the spec**, by pointer and by keyboard: click or drag empty space
  to create, drag a block to another time or day, resize from either edge, drag a task out
  of the Plan panel, complete a block from the block. The keyboard equivalents are `M` and
  `R` modes, a grid cursor, and a scheduling dialog, all producing the same span through
  the same helpers and committing through the same callbacks as the pointer path.
- **Persistence with rollback.** Eight server actions over wall-clock `(date, minutes)` —
  the server converts with the profile timezone, so the client never asserts an instant.
  One optimistic overlay for the whole week, patched per mutation and discarded by the
  transition on failure, with the server's own message in a toast and a working Retry.
- **The trusted path through the completion guards**, as `20260906130000_calendar_functions.sql`:
  `assert_caller`, `complete_block`, `uncomplete_block`, `complete_task`, `uncomplete_task`.
  Every one is `security definer`, reads the row before it writes, stamps with `now()`, and
  is idempotent under retry.
- **`@momentum/db`** gained the `blocks`, `tasks` and `projects` repositories, including
  the three-predicate window query of §11.
- **Tests:** 628 unit and component tests green, plus 181 database assertions
  (`pnpm test:db`), of which 27 are new and cover the completion functions, their
  idempotency, their refusal for another account, and that a direct client write to
  `completed_at` is still rejected.

### Verified in a browser, against the real database

Signed in as the seeded demo account and walked the week of Aug 31 – Sep 6:

1. Seven columns with the right dates, today distinguished, the now-line on today's column
   at the right offset and absent from the server render.
2. The four-way 14:00–16:30 cluster on Sep 2 laid out in three columns at equal widths.
3. The recurring lecture's moved occurrence rendered on Tue Sep 1 and its cancelled one
   absent from Thu Sep 3 — query-time expansion and overrides both working.
4. Keyboard move end to end: `M` → the candidate placeholder appears → `↓↓` moves it two
   snap increments → `→` moves it to the next day, duration preserved and announced →
   `Escape` restores the original → `M ↓ Enter` commits, and the row in Postgres is
   07:15–08:15.

### What an adversarial review round found

Five reviewers took a dimension each — the acceptance criteria, timezone correctness,
keyboard parity, the mutation path, and rendering/scope — and a sixth agent per dimension
tried to refute every finding. Of thirty candidates, nineteen survived. Four were fabricated
or overstated and were dropped; the rest are fixed, and each has a test:

**Three blockers.**

- **The guarded completion columns were guarded on UPDATE only.** A signed-in client could
  `POST /rest/v1/tasks` with `status: "completed"` and `actual_minutes: 999`, or a
  `calendar_blocks` row already carrying `completed_at`, and PostgREST returned 201. Domain
  Rule 15 says those columns are written only by trusted functions; on INSERT that was
  simply not true, and `actual_minutes` is the number Domain Rule 3 calls the product's
  long-term signal. `20260906130100_guard_inserts.sql` extends the three guards to
  `before insert or update`, and five assertions in `packages/db/tests/calendar.test.ts`
  now try each hole and are refused. The same migration revokes `execute` from `PUBLIC`,
  which `alter default privileges` had not covered for functions created by later
  migrations — `rpc/assert_caller` had been answering 204.
- **Saving any recurring occurrence failed.** `submitDraft` sent `updateBlock({ id })` with
  the `blockId` of a virtual occurrence, which is null, so every save came back as a
  validation error naming fields no longer on screen. An occurrence now writes only its
  times, through the override path — editing a series' content is the recurring-event
  editor, an explicit non-goal of this phase.
- **Deleting a block emptied the grid's tab order.** The tab stop was released on unmount
  and nothing re-claimed it, because `register` runs on mount and every survivor is already
  mounted — so one Delete made every block on the week unreachable by keyboard. The stop is
  now repaired on a microtask after the commit settles, which is also the only point at
  which the surviving set is known.

**And, among the majors:** deleting an already-overridden occurrence deleted the override
and resurrected the occurrence at its rule time; undo of a deleted habit block recreated it
as a plain event, severing the habit link; the editor let a habit block's title be typed
into `calendar_blocks.title` where it would stop tracking the habit; an occurrence moved to
another week vanished from both, because overrides were selected only by the date the rule
produced; `spanOf` added elapsed minutes to a wall-clock start, so a DST-spanning block lost
an hour every time it was saved; a keyboard move dropped focus to `<body>`; the block's
`role="button"` flattened away the completion control's role and name (one axe
`nested-interactive` violation per work block); both halves of a midnight-crossing block
claimed `aria-disabled` while remaining operable; a settled block's accessible name was
byte-identical to an outstanding one; and `opacity-60` on completed blocks took an
AA-verified colour pair down to 2.7:1.

**Three defects only a browser could surface, all fixed here:**

- **A hydration mismatch on every draggable.** dnd-kit derives its `DndContext` id from a
  module-level counter rather than React's `useId`, so a server process that had rendered
  the calendar before was one ahead of a freshly loaded client and every block's
  `aria-describedby` pointed at a different node than the server sent. `DndContext` now
  takes an explicit `id`.
- **15-minute blocks clipped their own titles.** At 56px an hour such a block is 14px tall,
  and one line of `text-2xs` plus `py-1` is 24px. Blocks under 20px now drop the padding
  and tighten the leading.
- **Three-across blocks were one character wide.** 12px of a 28px block was horizontal
  padding, and the time label took the rest to render "1…". The block is now its own
  container query: below 72px the padding halves, and below 92px the time label leaves
  (the screen-reader copy keeps it).

---

## What exists after Phase 4

### The finding that shaped the phase: there was nothing to migrate

Phase 4's brief was to refactor a single-block model into a multi-block one and migrate
the data. **No such model ever existed.** `tasks` has had no scheduling columns since
`20260906120300_tasks.sql`, and a work block has been a `calendar_blocks` row with
`kind = 'work'` and a required `task_id` since `20260906120500_calendar_blocks.sql` — the
first migration that could have got it wrong. `docs/ARCHITECTURE.md` §4 and this file's
dependency notes both said so in advance, and a search of every migration, type, mapper and
component confirms it: nothing in the repository has ever stored a task's schedule on the
task.

So no data moved, because no data was ever in the wrong shape. What Phase 4 shipped in
place of a migration is the guarantee a migration would have established, as
`packages/db/src/work-block-model.test.ts`:

- Every migration is read as text, and any `create table` or `alter table` on `tasks` that
  introduces `scheduled_start`, `scheduled_end`, `scheduled_at`, `start_at`, `end_at` or a
  block reference **fails the suite**. The guard was verified by adding such a migration and
  watching it fail, then removing it.
- The foreign key is asserted to live on the block, with no unique constraint on `task_id` —
  which is the specific fact that makes N-per-task possible.
- The generated `Row<"tasks">` is asserted to carry `due_date` and no scheduling column,
  so a regenerated `database.types.ts` would break the build.
- The spec's own example — essay due Friday, 135m, worked Mon 45m / Tue 60m / Thu 30m —
  is mapped end to end and its coverage summed, with an assertion that none of the three
  blocks falls on the due date.

The seed already contained exactly that example (`supabase/seed.sql`), so the shape was
demonstrable before a line of Phase 4 was written.

### The domain layer

`@momentum/core/tasks` is new, pure, framework-free, and — like the rest of `core` — runs
twice, under `TZ=UTC` and under `TZ=America/Los_Angeles`:

- **`views`** — the six views as predicates over one list, plus the toolbar's filters.
  Every one takes `today` as a parameter and none reads a clock. Subtasks and archived
  tasks are excluded from all six. Inbox is "open, no project", settling this file's open
  question. TODAY includes overdue, because an overdue task is more today's problem than
  today's own are.
- **`sorting`** — six sorts, stable, with a deliberate departure from a plain comparator:
  **missing values sort last in both directions**, so reversing "due date" does not float a
  hundred undated tasks above the three that are actually due. Plus `sortOrderForMove`,
  which returns the midpoint of a row's two new neighbours — one row written per reorder,
  never a renumbered list.
- **`coverage`** — scheduled versus estimated, summed across *all* of a task's blocks with
  elapsed-time arithmetic. An unestimated task never gets an invented denominator, and
  over-scheduling is reported rather than clamped.

`parseDuration` joined `@momentum/core/time` (`45`, `45m`, `1h30`, `1.5h`, `2:30`), which
is what `DurationInput` was waiting for.

### The application

- **Six views over one read.** `/tasks?view=&project=&task=` — the server reads every
  unarchived task, its blocks and the projects once, and the island computes all six views
  with the same pure predicates the tests cover. Switching view is a link, not a refetch.
- **Quick Add, mounted in the shell.** `Q` from anywhere, or the top bar's `+`; type a
  title, press Enter. Project, priority, date and duration are optional and inline.
  `parseQuickAdd` is a one-line seam so Phase 11 can add natural-language parsing without
  redesigning the input.
- **The detail side sheet** edits every field and saves each on commit — no Save button,
  no unsaved state to lose. Due date sits with the task's properties; work blocks are their
  own list; coverage sits between them.
- **The work-block editor**: 0..n rows with add, remove, day and time. Adding a second
  block does not replace the first, and the empty state says so, because a user who has
  only seen one-slot schedulers will not assume it.
- **The list**: one tab stop, roving focus, `↑↓` `Enter` `Space` `X` `Shift+↑↓` `Alt+↑↓`
  `Home` `End` `Esc` `⌘A`. Drag reordering by pointer and `Alt+↑/↓` by keyboard commit the
  same mutation through the same `sortOrderForMove` (Domain Rule 10).
- **One optimistic overlay** over the whole page, patched per mutation, thirteen mutations
  through one `useOptimisticAction`. No revert is written anywhere in the feature — the
  transition settling against unchanged props is the rollback (Domain Rule 11).
- **Three deferred primitives built**: `DurationInput`, `DatePicker`, `PrioritySelect`,
  plus `CoverageBar`. `docs/DESIGN_SYSTEM.md` is updated.
- **The sidebar's projects are real**, and each links to the sixth view.

### Tests

806 unit and component tests green (up from 628), including: the six views and their
edge cases; the sorts, their stability, and nulls-last in both directions; the coverage
maths on the spec's own three-block example; `sortOrderForMove` bisecting twenty times
without collapsing; the work-block model guard; the optimistic reducer; the keyboard model
driven through the shipped handlers; and **optimistic completion rolling back on failure**,
with the task's blocks asserted untouched throughout.

One defect was found and fixed by writing that last group. A block's wall-clock end was
being derived as "start plus elapsed length", which is right on 363 days a year: a block
drawn 01:00–03:00 on a spring-forward morning is 60 *elapsed* minutes but still ends at
03:00 on the *clock*, and the obvious formula would have shown 02:00 — a time that does not
exist that day — then rewritten the block an hour shorter the next time any other field on
it was touched. It is the same family as the `spanOf` defect Phase 3's review found.
`work-block-projection.test.ts` now asserts that the outward and return conversions are
inverses on both transition days, and asserts explicitly that the answer differs from the
formula it guards against.

A second defect was caught in review of this phase's own work. The list's rows started as
`role="option"` inside a `role="listbox"`, which reads correctly but is
children-presentational in ARIA — it would have flattened *both* checkboxes in every row
out of the accessibility tree. That is the same `nested-interactive` defect Phase 3's
review found on calendar blocks, reintroduced by a different route. The rows are a plain
list now: focusable for the roving cursor, named by their title, described by a hidden
"Selected" when selected, with every control still reachable. A test asserts both
checkboxes are in the tree and that no `option` role remains.

## What exists after Phase 5

### The scheduling engine

`@momentum/core/scheduling` is new, pure, framework-free, and — like the rest of `core` —
runs twice, under `TZ=UTC` and `TZ=America/Los_Angeles`. It is documented in
`docs/SCHEDULING.md`. Nothing in it reads a clock, touches the network or consults a
model: every function takes the blocks, the working hours, the focus windows, the task and
`now` as arguments, and the same input produces the same output on the server, in the
browser and in a test — a property the suite checks by shuffling its inputs.

- **`intervals`** — the arithmetic everything else reduces to: working and focus windows
  resolved to instants for a given day, busy intervals from the blocks that occupy time
  (Domain Rule 13: an unexecuted block of a completed task is free time; all-day items
  occupy nothing), subtraction, merging, and the wall-clock ↔ instant edges. It works in
  **instants and elapsed minutes**, because capacity is "how much of the week is left"
  and that only adds up in elapsed time; wall clock enters at the edges, through the same
  rule the server's actions apply (`intervalOfSlot` mirrors `spanInstants`), so a
  candidate is scored as the block that will be written.
- **`capacity`** — PLANNED, AVAILABLE, UNSCHEDULED WORK and the per-day workload. Planned
  sums every commitment that occupies time, block by block and clipped to each day
  (everything competes for the same week, and two blocks in one hour are two claims);
  available subtracts *merged* coverage from the working windows of today and the days
  after it (a minute cannot be freed twice); unscheduled is estimate minus scheduled,
  floored, over the drawer's tasks. Available counts today in full so the server render
  and the first client paint agree; the drawer's "~" says so.
- **`conflicts`** — the four warnings specs/05 names, in a stable order with a stable key
  each: **overlap** (one per pair of occupying blocks, events included), **past deadline**
  (a work block whose local start date is after its task's due date), **over capacity**
  (a day, or the range, whose planned minutes exceed its working window by more than
  `max(60, 25%)` — so a day off warns above an hour), and **insufficient time** (a task's
  remaining estimate exceeds the open working minutes between now and a deadline inside
  the range; deadlines outside the range are not judged, because the engine cannot see the
  free time between). `describeWarning` writes one factual sentence per warning and a
  test greps every string for the vocabulary Domain Rule 7 forbids.
- **`find-time`** — ranked candidate slots with explanations. Candidates are the starts of
  open windows and of the working, focus and suggestion windows inside them, snapped up to
  the profile's increment; each is scored on the spec's five criteria and the list is
  ordered **lexicographically** — deadline, working hours, overlaps, fragmentation, focus
  fit, then earliest start — with nothing weighted, so every ordering is explainable by
  the first field that differs. At most two candidates per day are returned while other
  days have any. Overlap is a filter first and a criterion second: an open evening slot
  beats a double booking inside working hours, and overlapping candidates are offered only
  when nothing open fits, ranked by fewest overlaps and named in the sentence. Off-hours
  suggestions are limited to 07:00–22:00 (`SUGGESTION_WINDOW`, the one tunable); configured
  working windows are honoured wherever they lie. The explanation reads
  "Wednesday 4:00–5:00 PM — 2-hour open window before Thursday deadline." A candidate
  whose wall-clock span would not round-trip through the server's conversion (a few
  readings on a fall-back night) is not offered, so what the drawer schedules is exactly
  what was scored.

### The application

- **The Plan My Week drawer** (`features/planning/`) replaces the Phase 3 Plan panel beside
  the calendar — the same persistent `SidePanel`, so the board stays visible. Top to
  bottom: the three capacity lines, one workload bar per day drawn against a faint track
  of the day's working window, the warnings list (glyph plus sentence, nothing a control,
  nothing blocking), then **OVERDUE · DUE THIS WEEK · UNSCHEDULED · WEEKLY GOALS**. Every
  number is derived from the server's sections plus the **optimistic** week
  (`live.ts`, `use-week-plan.ts`), so a drop moves the totals, the bars, a row's coverage
  and the warnings in the same frame, and a failed write rolls all of them back; an
  UNSCHEDULED row leaves the list the moment the board holds a block for it, while
  UNSCHEDULED WORK keeps counting the rest of its estimate.
- **Task rows** show name, due date, priority glyph, estimate, project and live coverage,
  and are the same dnd-kit drag source as before, so the grid's drop path did not change.
  Click, Enter or `F` opens **Find Time**; `S` opens the manual picker (Domain Rule 10).
- **Find Time** runs the engine over the board as the user sees it, in a `useMemo`, with
  `now` read once per open so the list does not reshuffle under the pointer. Each
  candidate is a sentence and a **Schedule** button; one click sends the engine's span
  through the same `onScheduleTask` a drag uses. The result's note explains an empty or
  fallback list ("No open window in this range fits 3h; the longest open window is 2h on
  Tue Sep 8. These times overlap existing blocks."). "Pick a time instead" swaps the same
  dialog to the manual form rather than opening a second one, because Radix's focus
  restore would otherwise strand a keyboard user on close.
- **Weekly goals** are listed read-only from the table the seed populates (title or a
  phrase built from the metric and target); progress and claiming remain Phase 8's.
- **Every string the drawer speaks lives in `features/planning/copy.ts`**, and
  `copy.test.ts` scans both the runtime strings and the comment-stripped source of every
  file in the feature for the words Domain Rule 7 forbids.
- **The calendar read** (`features/calendar/queries.ts`) now returns `PlanningData`: the
  three task sections made disjoint on the server (OVERDUE claims first, then DUE THIS
  WEEK, then UNSCHEDULED; subtasks excluded), each task's `scheduledOutsideMinutes`
  (all-weeks coverage minus the displayed window's own blocks, so the client can add the
  range's blocks live without double counting), the week's goals (`weekOf(first,
  profile.weekStart)`, so day view still lists them), and the profile's working hours and
  focus windows. Every work block item carries its task's deadline and estimate.
  `@momentum/db` gained `tasks.listOverdue` and a read-only `weeklyGoals` repository, with
  `packages/db/tests/planning.test.ts` (env-gated) proving the filters and RLS scoping.
- **Settings persist.** `features/settings/{schemas,actions}.ts` add one partial-patch
  action, `updateProfileSettings`, mirroring the `profiles_*_chk` constraints and the
  timezone trigger; every control on the page now commits on its own, one field per
  write, and takes the server's stored value back. Two new sections: **Working hours**
  (seven rows in the profile's week order, "Day off" for an empty day, up to six windows a
  day) and **Focus windows**, which Find Time prefers when it ranks. Overlapping windows
  are merged to a canonical sorted list by the schema rather than rejected, because the
  capacity maths treats them as one window anyway. Time fields commit on blur or Enter
  (`<input type="time">` reports each digit as a change), and a window whose end precedes
  its start is held with `aria-invalid` until the other field catches up rather than
  written or toasted about.

### Tests

1191 unit and component tests green (up from 806), plus 5 new env-gated database
assertions. Of the 385 new tests: the scheduling engine has 139 (intervals, capacity,
conflicts, Find Time — each ranking rule in isolation, determinism under shuffled input,
fully booked weeks, tasks longer than any gap, deadlines in the past, and DST on New
York's two transition days and Santiago's midnight gap); the drawer 79; settings 38. A
cold `pnpm build` is green.

### Not built, and why

- **HABITS** is absent from the drawer: Phase 6 has not shipped, exactly as specs/05 and
  the dependency notes anticipate. The section order is OVERDUE · DUE THIS WEEK ·
  UNSCHEDULED · WEEKLY GOALS; HABITS slots in between UNSCHEDULED and WEEKLY GOALS when
  Phase 6 lands, and `PlanningSection` takes any list of rows. _(Phase 6 has since added
  it, exactly there.)_
- **WEEKLY GOALS** is read-only: no progress and no way to create one, both Phase 8's.
- **Not walked in a browser** — see Current known issues.

---

## What exists after Phase 6

### The habit domain

`@momentum/core/habits` is new, pure, framework-free, and — like the rest of `core` — runs
twice, under `TZ=UTC` and `TZ=America/Los_Angeles`. Every function takes "today", the week
start and the habit's own start date as arguments; nothing in it reads a clock.

- **`model`** — the five frequency types reduced to the two things the maths cares about: a
  **cadence** (`per-day` for `daily`/`weekdays`/`amount_per_day`, `per-week` for
  `times_per_week`/`amount_per_week`) and whether the target accumulates. `isScheduledOn`
  answers "does this habit ask anything of this date", and answers **no** for the per-week
  cadence — "three times a week, any days" names no day, and inventing one would let the
  product say a day was skipped that the user never chose.
- **`progress`** — one day's state and the week's progress. The vocabulary is the deliverable
  as much as the maths: the states are `met · partial · open · ahead · free`. There is no
  "missed", anywhere, in any layer.
- **`consistency`** — the four numbers specs/06 asks for, all built from one `rateOver`, and
  all obeying one rule: **a period that has not finished is excluded from the denominator
  unless it has already been met.** Today cannot pull a rate down; the week in progress
  cannot break a streak. A habit younger than one whole week reports `value: null` — "not
  enough history yet", never 0%.
- **`plan`** — "Add to week". Per-day habits get one block on each remaining scheduled day;
  `times_per_week` gets its target spread evenly across the days still available;
  `amount_per_week` gets one session, because its target is a quantity and says nothing
  about how many sittings it takes. Dates that already carry a block are never planned
  again and count toward a weekly target, so pressing the button twice tops the week up
  rather than doubling it. The past is never planned.

Habits deliberately do **not** use the recurrence model (docs/ARCHITECTURE.md §11). There is
one expansion strategy in this product and it belongs to events; a habit's schedule is
`activeDays` plus a target, and "Add to week" writes real `calendar_blocks` rows.

### The trusted writes

`supabase/migrations/20260907120000_habit_functions.sql` opens the sanctioned path through
the grants that made `habit_completions` client-read-only since Phase 2:

- **`record_habit_completion(habit, date, amount, source_block)`** — upserts the one row for
  `(habit, user-local date)`. Boolean habits ignore the amount and a second call is a no-op;
  amount habits accumulate. The date must be within ±1 day of today **in the profile
  timezone**, so a caller cannot back-fill history and mint an XP event per past day.
- **`remove_habit_completion(habit, date)`** — deletes the row. The XP stays.
- **`complete_habit_block(block)` / `uncomplete_habit_block(block)`** — the two facts of
  completing a habit block, in one transaction: the span was executed (Domain Rule 13) and
  the habit was done on the block's own local date (Domain Rule 14). Un-completing removes
  only the completion *that block* created; a day ticked from the habits page survives.
- **`habit_completion_id(habit, date)`** — a completion's primary key derived from its
  natural key. This is what makes the XP award idempotent across a removal and a re-record
  (Domain Rule 6): the id is a function of the fact, not of the attempt that wrote it. The
  seed now uses the same helper, so a seeded day cannot earn a second award.

`complete_block` is untouched and still does exactly what Phase 3 said it does.

### The surface

- **`/habits`** is a server read and one client island. Rows show name · target · this
  week · progress · consistency · XP, with an edit menu, "Add to week", and a detail sheet
  carrying the four statistics and a twelve-week heatmap. All five frequency types can be
  created and edited; the form normalises the fields a new shape cannot carry, so it can
  never submit a combination the database refuses.
- **Recording a day is a click on the week strip**, on the three days the database will
  accept — yesterday, today and tomorrow. Outside that window the cell is static rather than
  a control that must fail. The optimistic overlay patches the *completions* and re-runs the
  same `@momentum/core/habits` functions the server ran, so the strip, the progress line and
  every rate move and roll back together.
- **The calendar** gained the habit half of its completion control. A habit block's control
  reads "Mark habit done", routes to `complete_habit_block`, and is offered by the pointer
  and by `Space` under the same condition (Domain Rule 10).
- **The planning drawer** gained its HABITS section, between UNSCHEDULED and WEEKLY GOALS,
  closing the gap specs/05 deferred. Habit rows are not drag sources: a habit's schedule
  already names its days, so its route into the week is the same "Add to week" the habits
  page offers, calling the same action.
- **Nothing on the surface is punitive.** Every string it can render lives in
  `features/habits/copy.ts`, and a test greps all of them for the vocabulary Domain Rule 7
  forbids. That test caught real copy during the build ("a missed day…") and the phrase was
  changed, which is the point of having it.

### Tests

1499 unit and component tests green (up from 1438), plus 16 new env-gated database
assertions in `packages/db/tests/habits.test.ts`. The new coverage: 63 in
`@momentum/core/habits` (block generation for every frequency, idempotence when "Add to
week" is pressed twice, consistency across week boundaries and both of 2026's US DST
transitions, week-start sensitivity, amount habits); the optimistic overlay's
deduplication against `record_habit_completion`'s exact semantics; the "Add to week"
action's wall-clock conversion, including a 07:00 habit keeping 07:00 across a
spring-forward; the copy's vocabulary; the heatmap's layout; and the two completion
controls.

### Not built, and why

- **The XP a completion earns does not yet move `profiles.xp`.** `record_habit_completion`
  inserts the `xp_events` row `docs/DATABASE.md` specifies, with the amount from
  `habits.xp_reward` — a number the schema already caps, so nothing is invented here. The
  `apply_xp_event()` trigger, `level_for_xp()` and `evaluate_achievements()` are Phase 8's,
  exactly as they are for `complete_task`.
- **Habit reminders, templates and streak freezes** are explicit non-goals of specs/06.
- **Not run against a live database, and not walked in a browser** — see Current known
  issues.

---

## What exists after Phase 7

### The timer, and why it cannot drift

`specs/07-focus-mode.md` names one thing as easy to get wrong, and the whole phase is
built around not doing it. **Nothing counts.** There is no decrementing counter anywhere in
the product, and no accumulated tick total: `focusTimerState` in `@momentum/core/focus`
takes a session's `started_at`, its pause records and an instant, and returns the elapsed,
paused, remaining and overrun time as a function of those three things. The interval in the
browser decides how often that function is called; it contributes nothing to what it
returns.

That makes the three failure modes the spec lists the same failure mode — "nobody asked for
a while, and then somebody did" — and all three are covered:

- **A backgrounded tab** is throttled to about one timer a minute, and sometimes to none.
  The next tick, whenever it arrives, is correct.
- **A reloaded page** starts from nothing and its first render is already right, because
  the server sent the same timestamps it had before.
- **A slept machine** fires no intervals at all. `visibilitychange`, `focus` and `pageshow`
  each force a recomputation on the way back, so the screen is right before the next second
  would have arrived — and without them the next tick would still fix it.

The clock the browser reads is corrected once against `serverNow`, the instant the page was
rendered at (`clockOffsetMs` / `offsetClock` in `@momentum/core/time`). The persisted
timestamps are the database's; subtracting them from an uncorrected local reading mixes two
clocks, and a device four minutes fast would render a session four minutes out. The
correction survives sleep, because wall-clock time keeps running across it.

`use-focus-timer.test.tsx` drives the *wall clock* rather than the interval, which is the
only way to reproduce any of this: `vi.advanceTimersByTime` fires every interval a
throttled tab never got. Ten cases, including five minutes with no tick, two hours asleep,
a fresh mount ten minutes in, and a device clock four minutes fast.

### The domain layer

`@momentum/core/focus` is new, pure, framework-free, and — like the rest of `core` — runs
twice, under `TZ=UTC` and `TZ=America/Los_Angeles`:

- **`timer`** — the above. Pauses are clipped to the session's own span before they are
  subtracted, which is what makes an *open* pause work: a paused session's elapsed time
  stops advancing and resumes from where it stopped, and a session ended while paused
  counts the pause up to its end and no further.
- **`presets`** — 25/5, 50/10, 90/20, and the bounds a custom length sits in. Those bounds
  are `focus_planned_chk`'s, not a second opinion about them.
- **`xp`** — the award rule as an executable specification, with the anti-farming shape the
  spec asks for. See below.
- **`history`** — today, this week and per-project totals. A session belongs to the local
  date it *started* on, so one begun at 23:40 is counted on the day the user sat down.
  `focusedMinutes` counts every measured minute a finished session recorded, an abandoned
  one included; `completedSessions` counts only the ones that ran to a finish. There is no
  third number for the sessions that stopped early (Domain Rule 7).

`@momentum/core/time` gained `durationSeconds` (a timer is the one thing that needs
sub-minute resolution), `formatCountdown` (`25:00`, `1:30:00`), and the two clock-offset
helpers.

### The trusted writes

`supabase/migrations/20260907130000_focus_functions.sql` opens the sanctioned path through
the grants that made `focus_sessions` and `focus_pauses` client-read-only since Phase 2.
Every timestamp on both tables — `started_at`, `paused_at`, `resumed_at`, `ended_at` — is
stamped with `now()` inside these bodies, and no function takes a timestamp as an argument.
A test asserts that last sentence about the migration's own text, because it is the whole
reason the measurement is worth anything.

- **`start_focus_session`** refuses a second live session with a message rather than a
  constraint name, which is also what makes "overlapping concurrent sessions do not
  double-count" true by construction. Its `id` is client-generated: a retry after a lost
  response rejoins the session it created instead of being told the account already has one.
- **`pause` / `resume` / `mark_interruption`** are no-ops in the state they would produce.
- **`end_focus_session(id, status)`** is the shared body of both endings: close any open
  pause, compute the measured minutes, add them to the linked task. `finish_focus_session`
  and `abandon_focus_session` are thin wrappers, so there is one implementation of what a
  session leaves behind. Only finishing awards XP.
- **`xp_rule`** arrives here rather than in Phase 8, because `docs/DATABASE.md` defers a
  helper "with the functions that use them" and this is the first of them. It carries the
  six focus tunables and raises on an unknown name; Phase 8 adds the rest, plus
  `level_for_xp()` and the `apply_xp_event()` trigger that moves `profiles.xp` — still
  deferred, exactly as `complete_task` and `record_habit_completion` left it.

**Ending early still credits the task.** `docs/DATABASE.md` said `abandon_focus_session`
records `actual_minutes` and no XP without saying whether the task's own total moved; it
does, and the row now says so with the reason. Twenty-five minutes of work are twenty-five
minutes of work whether or not the bell rang, and dropping them would make every
estimate-versus-actual comparison under-report the number Domain Rule 3 calls the product's
long-term signal.

### XP, and the one duplication that is allowed

The award is computed in SQL, in the transaction that ends the session, from rows the
database stamped itself. The client sends an id.

`FOCUS_XP` and `focusXpAward` in `@momentum/core/focus` are the same rule written where it
can be tested exhaustively without Docker, and where the interface can state a tunable it
legitimately needs ("sessions under five minutes do not earn" belongs *before* the session,
not after it). Two copies of a rule is the duplication `CLAUDE.md` forbids, so they are
pinned together: `packages/db/src/focus-rules.test.ts` reads the migration as text, extracts
the numbers `xp_rule()` returns and compares each with its constant. Changing a tunable is a
migration **and** a one-line change in `xp.ts`, or the suite goes red. The same file asserts
four structural facts about the migration: no focus function takes a timestamp, there is
exactly one `xp_events` insert and it is guarded by `on conflict do nothing`, the
already-ended early return precedes every write, and exactly the six lifecycle functions are
granted.

### The surface

- **`/focus`** is a server read and one client island. At rest: the length control (three
  presets and Custom, which reveals a minutes field), the task picker, one button, and the
  XP rules stated up front. Running: the task, a ring, the countdown, and Pause · Finish
  session · End session, plus "Mark an interruption" — which is only ever a button, because
  the application cannot see the user's other windows and a count it inferred would look
  measured while being invented.
- **Three routes in.** `?task=` from the task detail sheet's **Start focus**; `?task=&minutes=`
  from a work block's editor, where the block's own length becomes the session's planned
  length; and Phase 11's palette, which the query parameters are already shaped for. Both are
  links, not buttons: a link that started a timer would start one every time it was followed,
  including by a back button. A `?task=` the page cannot resolve is dropped rather than
  pre-selected.
- **No optimistic overlay, deliberately** — the one mutating surface in the product without
  one. A session's state is a measurement whose timestamps only the database can produce,
  and an optimistic "started at" would be the client's clock, which is the number this phase
  exists to stop trusting. Each control waits for the server's row; failures surface as a
  toast with the server's own message and a working Retry, and every action is idempotent so
  the retry is safe (Domain Rule 17).
- **History** shows today's focused minutes and sessions, the week's minutes, the week by
  project, and the recent sessions — all from one read of the same rows, so the totals and
  the list underneath them cannot disagree. The XP line reports what the ledger holds against
  the daily cap; it never predicts what the running session will earn.
- **The focus placeholders are gone** from `lib/placeholder-data.ts`, as that module's own
  docblock says they should be once the feature has a real query.

### Nothing is claimed that the product cannot do

`specs/07-focus-mode.md` says not to fabricate capabilities, and `copy.test.ts` makes that
testable. Eleven patterns — blocking sites or apps, silencing notifications, do-not-disturb,
ambient sound, notifying or reminding the user, locking a screen — are checked against every
string `FOCUS_COPY` can render **and** against the comment-stripped source of every file in
the feature, because a sentence typed into a component is a sentence the copy module cannot
see. The patterns are about capability claims rather than the word "block", which this
product uses constantly and correctly for a span of calendar time.

The screen states the limit once, where a user would otherwise assume it: "Momentum times
the session and records the minutes. It does not change anything else on your device."

The same file carries the Domain Rule 7 guard. `abandoned` is a value in a database enum;
what the product says is **Ended early**.

### Tests

1669 unit and component tests green (up from 1499), plus 20 new env-gated database
assertions in `packages/db/tests/focus.test.ts`. The new coverage: 44 in
`@momentum/core/focus` (elapsed derivation including the backgrounded, reloaded and slept
cases; pause and resume arithmetic including open, clipped and inverted spans; every
anti-farming rule, both caps, and a whole day of maximal sessions bounded at the daily cap;
the history totals and their timezone boundary), 10 on the rendering loop, 17 on the page's
contract with the server (what each control sends — an id and a length, never a time and
never an amount — and, under Domain Rule 10, that no control disables itself while focused,
that each refuses a second press while a write is in flight, and that focus moves to the
timer when a session appears but not on a page loaded with one already running), 14 on the
copy and the capability guard, 13 on the migration's text, and 7 on the two launch points
(the task detail sheet and a work block's editor) — that each is a link rather than a
button, that the block carries its own length and clamps it to the schema's cap, and that
neither is offered where a session makes no sense.

The database suite — which is the only place the "client cannot write these tables at all"
claim can be made — covers the direct-insert refusals on all three tables, the neighbour
seeing nothing, one live session, the retry-by-id, pause exclusion from the recorded
minutes, both caps, the sub-minimum session, and finishing three times awarding once.

### Not built, and why

- **The XP a session earns still does not move `profiles.xp`.** `finish_focus_session`
  inserts the `xp_events` row; the `apply_xp_event()` trigger and `level_for_xp()` are
  Phase 8's, exactly as they are for `complete_task` and `record_habit_completion`.
- **`evaluate_achievements()`** is not called, for the same reason.
- **Website blocking, ambient sound, native notifications and a menu-bar timer** are
  explicit non-goals of this spec (the last two are Phase 15's).
- **Not run against a live database, and not walked in a browser** — see Current known
  issues.

---

## What exists after Phase 8

### The one rule the phase is built around

**The client sends an id.** Every server action in `features/gamification/actions.ts` takes
a uuid and, in one case, a boolean; there is no field anywhere in the feature for an amount,
a level, a coin balance or a progress figure, and there is no code path from the browser to
one. Claiming a quest names the assignment and the database recomputes the work from
`tasks`, `focus_sessions`, `habit_completions` and `calendar_blocks` before it writes.
Buying a cosmetic names the cosmetic and the database reads the price from a row only a
migration can write. Domain Rule 6 is not promised here; it is the shape of the module.

`packages/db/tests/gamification.test.ts` attacks it from the other side — direct inserts
into `xp_events`, `user_achievements` and `quest_assignments`, direct updates of
`profiles.xp`, `level` and `coins`, an RPC to `award_xp` and `reconcile_xp`, and one account
claiming another's quest. All of them are refused. That suite is env-gated and has never
run (see Current known issues); `packages/db/src/gamification-rules.test.ts` makes the same
claims about the migration's *text* on every `pnpm test`.

### The migration

`supabase/migrations/20260907140000_gamification_functions.sql` (1,486 lines) closes the
loop three phases deliberately left open.

- **`xp_rule()` gained the rest of its tunables**, exactly as Phase 7 said it would, with
  the six focus numbers reproduced unchanged. `focus-rules.test.ts` now finds the *newest*
  migration defining `xp_rule` rather than reading Phase 7's file, so replacing the function
  did not quietly unpin `FOCUS_XP`.
- **The level curve** — `xp_for_level()` and `level_for_xp()`, `floor(100 * (L - 1) ^ 1.5)`,
  finalised as `docs/DATABASE.md` proposed and documented with thirty thresholds and the
  reasoning in `docs/ARCHITECTURE.md` §16. `level_for_xp` corrects its analytic answer
  against the thresholds in both directions, so floating point never decides a level.
- **Two triggers on the ledger.** `cap_xp_event()` before insert applies the per-source
  daily cap in the user's own day; `apply_xp_event()` after insert moves `profiles.xp` and
  recomputes the level. The second is the only statement in the product that touches either
  column, which is what makes the total and the ledger the same number by construction
  rather than by a job that runs later.
- **`complete_task()` awards**, from a body replaced in place. Phase 3 predicted this would
  change no caller, and it changed none.
- **Achievements** — `achievement_earned()` for the six conditions, `habit_week_met()` for
  the one that needs a habit's weekly target in SQL, and `evaluate_achievements()` called by
  four statement triggers.
- **Quests** — `assign_quests()`, `ensure_quest_assignments()`, `quest_progress()`,
  `claim_quest()`, over one `metric_progress()`.
- **Weekly goals and cosmetics** — `weekly_goal_progress()`, `claim_weekly_goal()`,
  `purchase_cosmetic()`, plus a new `cosmetic_definitions.available`.

### Four decisions worth knowing

**The daily caps live on the ledger, not in the awarding functions.** Domain Rule 6 makes
anti-farming part of the calculation, and a `before insert` trigger is the only place that
is true for sources nobody has written yet. It also meant Phase 7's `finish_focus_session`
kept its own tested body: it computes the same number and the trigger passes it through, and
replacing a working, pinned function for symmetry is the churn `CLAUDE.md` forbids. Tasks
are capped at 200 XP a day (twenty ordinary tasks) and habits at 100 — far above a real day
and far below what a loop would mint. A cap bounds the reward and nothing else: the task
still completes, the minutes are still recorded, and nothing already earned is touched.

**Achievements are evaluated from the source tables, not from the ledger.** One trigger on
`xp_events` would have been simpler and would have had a hole in it: a habit whose reward is
zero, and a ninety-minute session finished after the day's focus cap was full, both do real
work and mint no ledger row, so Deep work would never have unlocked for the user who most
obviously earned it. Four statement triggers watch `tasks(status)`,
`calendar_blocks(insert, completed_at)`, `focus_sessions(status)` and `habit_completions`
instead — statement-level with transition tables, so planning a week is one evaluation
rather than twenty, and skipped entirely when there is no `auth.uid()` so `supabase/seed.sql`
still decides its own demo state.

**A weekly goal's award is keyed on `(user, week, metric)`, not on the row id.**
`weekly_goals` is the one claimable thing a client can delete and recreate, and an id-keyed
award would have been mintable again every time. The key is the pair `weekly_goals_uniq`
already calls the row's identity — the same reasoning Phase 6 applied to
`habit_completion_id`, one step further in. The database suite performs exactly that
exploit and asserts the second claim pays nothing.

**Quest selection is a rotation, not an md5 ordering** _(revises `docs/DATABASE.md`)_.
`index = (days since 1970 + last four hex digits of the account id) mod n`, then the next
three (daily) or two (weekly) definitions in key order, wrapping. The reason is not taste:
`docs/ARCHITECTURE.md` §2 puts quest selection for display in `@momentum/core/gamification`
and specs/08 requires a unit test of the determinism, so the rule has to be expressible in
TypeScript that runs in a browser — and an md5 ordering is not, without shipping a hash for
it. The rotation is four lines in both languages and moves the set day to day instead of
pinning an account to one ordering for ever.

### The domain layer

`@momentum/core/gamification` is new, pure and framework-free, and — like the rest of
`core` — runs twice, under `TZ=UTC` and `TZ=America/Los_Angeles`:

- **`levels`** — the curve, its inverse, and `levelProgress()` for the top bar. The inverse
  is asserted at every threshold and every threshold minus one, which is the case floating
  point gets wrong when nothing corrects it.
- **`xp`** — `TASK_XP`, `XP_DAILY_CAPS`, `REWARD_XP`, and `taskXpAward()` as an executable
  specification of the SQL.
- **`quests`** — `selectQuests()` (the rotation), `QUEST_TARGET_CAPS` (mirroring
  `quest_definitions_volume_chk`), and `questFactsFor()`, which buckets a week's rows into a
  day's and a week's facts in the profile timezone so the two can never disagree about the
  same completion.
- **`achievements`** — the key union, the thresholds the copy quotes, and the one cosmetic
  kind this phase renders.

Every number in it is pinned to `xp_rule()` by `packages/db/src/gamification-rules.test.ts`,
which reads the migration as text. Changing a tunable is a migration *and* a one-line change
in `core`, or the suite goes red.

### The surface

- **`/progress`** is a server read and one client island: the level and coin balance, the
  day's quests and the week's, weekly goals, the six achievements, the shop, the recent
  ledger, and a plain statement of what today's caps have paid out. Nothing on it is a hero
  banner.
- **No optimistic overlay, deliberately** — the second surface in the product without one,
  and for a related reason to the focus timer's. Every mutation here is a server decision:
  whether a quest is finished, what it is worth, whether the coins are there. An optimistic
  "+20 XP" would be the client asserting an amount one frame before the server decided it.
  Each control waits for the row; failures surface with the server's own message, and every
  action is idempotent so a retry is safe.
- **The top bar's `XPBar` is real.** `PLACEHOLDER_PROFILE` is gone from
  `lib/placeholder-data.ts`, as that module's docblock says it should be once the feature
  has a query. The bar is a link to `/progress`, and its width transition is the whole of
  the routine XP feedback.
- **`ProgressProvider`** is mounted in the shell, not on the page, because a level earned on
  `/tasks` has to be noticed on `/tasks`. It compares the badge the server just rendered
  with the last one it saw: an achievement wins over a level, a level over a weekly goal,
  and any of them suppresses the "+N XP" that would otherwise have accompanied it. Two
  unlocks at once are one toast. The first render establishes a baseline and celebrates
  nothing, so a page reload is not a party.
- **`prefers-reduced-motion` removes the flourish, not the news.** `AchievementToast`
  renders no animated element at all when the viewer has asked for less motion, rather than
  rendering one with a zero duration — `globals.css` already does the latter, and it is not
  what "suppresses celebration animation" means. The message still arrives.
- **One cosmetic collection is implemented**: profile frames, drawn around the avatar in the
  top bar from an exhaustive `Record<ProfileFrameKey, string>`. The other three kinds keep
  their definition rows and are marked `available = false`; the shop says "Not for sale yet"
  and `purchase_cosmetic()` refuses them.

### Tests

1,843 unit and component tests green (up from 1,669), plus 26 new database assertions —
and, for the first time in this project, **the database suite actually ran**: 326
assertions against a live Postgres, repeated three times without a reset in between. What
that cost and what it bought is in "The first live run" below. The new unit coverage in `packages/db/tests/gamification.test.ts`. The new coverage: 43 in
`@momentum/core/gamification` (the curve and its inverse at every boundary, the task award
and a 500-completion farm bounded at the cap, rotation determinism across days and accounts,
the target caps, and fact bucketing across a local midnight that is already tomorrow in
UTC); 47 in `packages/db/src/gamification-rules.test.ts` (every tunable pinned, one guarded
ledger insert, nothing that lowers a total, the exact grant list, no amount in any granted
signature, progress recomputed before either claim writes, all twelve volume caps with an
`else false` fallback, the rotation written the same way in both languages, and the four statement triggers with the
right owner); 21 on the
page's contract with the server and its states; 8 on celebration and its restraint; 10 on
the toasts, the reduced-motion suppression and the frame; and 8 on the vocabulary, which
reads the feature's own source as well as `copy.ts` because a sentence typed into a
component is a sentence `copy.ts` cannot see.

### The first live run

Phases 6, 7 and 8 were all written without Docker, so no migration after Phase 3 had ever
been applied and `MOMENTUM_DB_TESTS=1` had only ever skipped. Running it found six defects.
Three were in this phase's own work, and three were older — which is the argument for
running it, not against it.

1. **The entire function surface was executable by `authenticated`.** `alter default
   privileges ... revoke execute on functions` does not reach functions created by later
   migrations, so everything Phases 6, 7 and 8 added carried `PUBLIC EXECUTE`.
   `award_xp(user, source, source_id, amount, reason)` was callable from a browser. Domain
   Rule 6 held in every line of application code and failed in the database. Fixed by
   revoking by name and re-granting the twenty-three sanctioned functions, now asserted
   both against the migration's text and against the live catalogue.
2. **`xp_rule()` could never have been created** — a forward reference in a `language sql`
   body, which Postgres resolves at creation. Phase 7's migration aborted on statement one.
3. **`remove_habit_completion` returned a row of nulls rather than null**, because a NULL
   composite is not JSON null; the mapper threw. Now `returns setof`.
4. **Completing a habit block could delete a completion the user had made by hand**, because
   the upsert let a block claim a row it had not created.
5. **Transition tables are refused on triggers with a column list or more than one event**,
   which reshaped the achievement triggers — and moved the narrowing inside the evaluator,
   where it narrows the work rather than only the firing.
6. **The database suite raced itself**, running its files in parallel against one shared
   account whose ledger, level and daily caps every file asserts on. Two suites also cleaned
   up more, or less, than they created.

The suite now passes from a fresh reset and passes again twice more against the database it
just dirtied, which is the property that makes it worth keeping.

### Not built, and why

- **The planning drawer's WEEKLY GOALS section is still read-only.** Progress, creation and
  claiming all exist — on `/progress`, which is where the week's goals sit beside the quests
  and the level they feed. Adding progress to the drawer as well would put four more reads
  on the heaviest page in the product for a number one click away, so it was not done. The
  drawer still lists the week's goals and marks the claimed ones.
- **Three of the four cosmetic kinds are not for sale**, by the decision above.
- **No leaderboards, social features, pets, purchasable functionality, real-money purchases
  or combat** — the explicit non-goals of specs/08.
- **Not run against a live database, and not walked in a browser** — see Current known
  issues.


---

## What exists after Phase 9

### The four questions, and nothing else

`/today` answers what specs/09-today.md says it answers and carries nothing that answers
none of them: **what am I doing today · what should I do next · how am I progressing today
· is anything at risk.** The type is where that claim is kept honest — every field of
`TodayPageData` belongs to one of the four — and the two things a dashboard would have
added are absent by decision rather than by omission: there are no stat tiles, and the
week's quests, the week's goals, consistency percentages and the heatmap all stayed on the
pages that already answer for a week.

### Next Up, which always has an answer

`selectNextUp` is a pure function of the page and one instant, and it has four shapes
because there are four genuinely different situations:

1. **The next incomplete scheduled item by the current time.** Candidates are the timed
   blocks that are neither settled nor already over, so a block that is *running* is the
   earliest of them and the mid-block state falls out of the ordering instead of being
   special-cased. A block that ended without being ticked is deliberately not "next" — it
   is in the past, and the timeline is where it gets ticked.
2. **Nothing scheduled — what is due soonest**, from a list the server ordered by deadline.
   A task scheduled for another day still qualifies: it is what is due soonest and today
   simply holds no time for it (Domain Rule 1).
3. **Everything done**, with what the day added up to.
4. **An open day**, which is neither an achievement nor a reproach.

Domain Rule 13 is respected throughout: an incomplete future block of a completed task
renders as settled and is skipped. **Start focus is a link, never a button** — Phase 7's
decision, and the reason `?task=` and `?minutes=` exist — carrying the block's own length
clamped to the bounds `focus_planned_chk` enforces. Complete goes through the same
`setBlockCompletion` the calendar uses with the same server-decided
`alsoCompleteTask`, and Reschedule commits the same wall-clock `DaySpan` a drag on the
board commits.

### At Risk, which is usually not there

Three kinds, exactly as the spec lists them: an overdue task, a task due soon without
enough open time before its deadline, and a calendar conflict. **The section is not
rendered when the list is empty** — not rendered as a zero, not reserved in the skeleton —
because a permanent "nothing at risk" panel is a place for the eye to keep checking.

The two warnings are `@momentum/core/scheduling`'s own, sentence included, so the copy is
the engine's already-tested wording rather than a second phrasing to keep in step. The
blocks are read over **today and tomorrow** rather than today alone: the extra day is what
lets the engine judge a deadline that is not today's, since it deliberately refuses to
judge a deadline outside the range it can see the free time in. Over-capacity and
past-deadline warnings are dropped — they are planning questions and belong to the drawer
that can act on them.

Overdue rows are derived on the *client* from the task list rather than sent as warnings,
which is what makes the section answer to the optimistic overlay: completing an overdue
task clears its row in the same frame, completing the task a shortfall is about clears the
shortfall, and completing either half of a double booking clears the overlap — because a
completed block occupies no time and the engine would not have raised it on the next read
either. A failed write rolls all of it back, because none of it is state.

### The surface

- **The timeline** is today's slice of every block that touches it, placed by
  `splitByLocalDay`, so a block that began at 23:00 yesterday starts the list at 00:00 and
  one that runs past midnight ends it at 24:00 — both marked as continuing. Wall clock
  places the row; **elapsed** minutes are its duration, and the two differ on the days the
  distinction exists for. Past, current and future differ in emphasis, in the shape of the
  row's marker, and in a word, so the list reads in greyscale and to a screen reader.
- **The completion control is offered exactly where the calendar offers it.** The
  condition that was written out twice in Phase 3 is now `isCompletable` in
  `features/calendar/projection.ts` and is used by the block's pointer control, its
  keyboard route and this timeline; the label is `completionLabel`, which the server's
  `completesTask` decides. A control offered where the database would refuse is a promise
  the product cannot keep.
- **Tasks** are the ones due today with no time reserved anywhere. A task due today that is
  already on the calendar is on the timeline, and listing it twice would be the page asking
  one question in two places.
- **Habits** are the ones today asks something of — the days a per-day habit names, plus
  every per-week habit whose week is not yet met, because "three times a week, any days"
  names no day and inventing one would let the product say a day was skipped that nobody
  chose. One press records the day; an amount habit tops up to today's target, which is
  what `record_habit_completion` will do with the amount sent.
- **Quests** are today's only, with the progress the server computed from the same rows a
  claim is re-checked against, so Claim is never offered for something that would be
  refused.
- **The header** is the greeting, the date, the level and what today has earned — one row,
  no tile. Below `md` the `h1` is visually hidden as it is on every route, so the greeting
  is repeated visually and marked `aria-hidden`; the page still has exactly one `h1`, which
  the live render confirms.

### One optimistic overlay, four mutations

`useTodayMutations` follows `use-task-mutations.ts`: one `useOptimisticAction`, an action
that dispatches on the patch, and a pure reducer. The reducer patches *facts* and
re-derives everything else — the timeline, Next Up, the habit counts and the risks are all
functions of the page — so a completion that also completes its task settles that task's
other blocks, and a rescheduled block re-sorts and can leave the day, through the same
`buildTimeline` the server ran. **No revert is written anywhere in the feature**, which is
why there is none to get wrong (Domain Rule 11). Claiming a quest is deliberately outside
the overlay: a claim is a server recomputation from four source tables, and an optimistic
"claimed" would be the client asserting a reward.

### Three extractions, not three copies

- `features/calendar/items.ts` now holds the rows-to-`CalendarItem` mapping that was inside
  `features/calendar/queries.ts`. Resolving a block's title from its parent, its colour,
  whether completing it also completes its task and whether a habit block's date is one the
  database will record each have exactly one correct answer, and two pages computing them
  separately would eventually disagree.
- `patchCompletions` is exported from `features/habits/optimistic.ts` and used by both
  surfaces. It is the one prediction of what `record_habit_completion` writes; two reducers
  guessing separately at one database function is how two screens come to show different
  numbers for the same day.
- `useOpenerFocus` moved from `features/calendar/components/block-editor.tsx` to
  `lib/use-opener-focus.ts`. Six dialogs across four features already imported it from
  there, which made every one of them import the calendar's block editor — including
  Today's reschedule dialog, on the page that has to open fastest.

`features/calendar/actions.ts` now revalidates `/today` and `/tasks` as well as refreshing,
for the reason `features/tasks/actions.ts` already revalidated `/calendar`.

`lib/placeholder-data.ts` is down to its analytics constants; Phase 10 deletes the file.

### Tests

1930 unit and component tests green (up from 1843), and the database suite re-run clean at
326 assertions. The new coverage: 39 in `agenda.ts` (timeline placement including a
midnight crossing in both directions, an all-day item, a fall-back day where wall clock and
elapsed time disagree, a total ordering; every Next Up state including mid-block, settled
blocks, an all-day item that is never "next", and a task due today that is scheduled
elsewhere; risk assembly and each of the three ways a risk clears), 11 on the optimistic
overlay (including that the input page is never mutated, which is the property the rollback
relies on), 6 on the Domain Rule 7 copy guard, 32 on the page end to end, and **4 on
`useMidnightRollover`** — which had none — driving the wall clock across New York's
spring-forward and fall-back days to prove the wait is 23 and 25 hours rather than a
hardcoded 24.

### Verified against the live database

The page was rendered for **both** seeded accounts and the markup read back:

- `demo@momentum.test` (America/New_York): the greeting and date in the profile timezone,
  level and today's XP, **At Risk with one row** ("Deploy staging build was due yesterday,
  Sep 7."), Next Up on the 08:00 habit block with Start focus · Mark habit done ·
  Reschedule, four timeline rows in order including a recurring event's moved occurrence,
  one unscheduled task due today, four habits across three frequency types, and three
  quests with one claimed and one claimable.
- `second@momentum.test` (Europe/London): the same page with **no At Risk section at all**,
  which is the acceptance criterion demonstrated rather than asserted, and the "everything
  due today already has time reserved" empty state.

Exactly one `h1` in both, and the mobile greeting marked `aria-hidden`.

### Not built, and why

- **No AI suggestions, no analytics charts, no weekly review, no news or quote widget, and
  no generic stat tiles** — the explicit non-goals of specs/09.
- **Quick Add is not on this page**; it is mounted in the shell and reachable with `Q` from
  here as from anywhere (Phase 4).
- **Not driven in a real browser.** The Chrome extension was not connected this session, so
  the 375px layout, the two themes and every pointer interaction are argued from the markup
  and from the component suite rather than measured. See Current known issues.

---

## Dependency notes

- **3 depends on 2** (persistence) and **1** (shell/primitives).
- **4 did not need to refactor 3's scheduling model** — confirmed, not merely predicted.
  The schema is multi-block from the first migration (`calendar_blocks.kind = 'work'`,
  `task_id` on the block) and `tasks` has no scheduling columns (`docs/DATABASE.md`).
  Phase 4 added a test that keeps it that way; see "What exists after Phase 4".
- **5 depends on 4** (task metadata) and **6** (habits appear in the planning drawer).
  If 6 is not done, build 5 without the habits section and note it here.
  **Confirmed in Phase 5:** built without HABITS; see "What exists after Phase 5".
- **7 writes actual minutes**, which **10** reads. The write shape is fixed:
  `finish_focus_session()` sets `focus_sessions.actual_minutes` and adds to
  `tasks.actual_minutes`. **Confirmed in Phase 7**, with one addition Phase 10 should know
  about: `abandon_focus_session()` writes the same two columns and simply awards no XP, so
  a read of `tasks.actual_minutes` includes the time from sessions that ended early. Both
  go through the one internal `end_focus_session(id, status)`, so there is a single place
  the write shape is decided.
- **8 depends on 4, 6, 7** for XP sources. The ledger and the awarding functions are
  designed so sources can be added (`xp_source` enum + `xp_rule()`).
- **9 depends on 3, 4, 7** and, for quests, **8**.
- **11 touches every feature** — build it after the features exist, not before.

---

## What the Phase 0–5 integration audit changed

The audit `docs/PROMPTS.md` schedules after Phase 5. It read Phases 0–5 as one system
rather than six features, along six non-overlapping dimensions — time semantics, data
model and security, the task/block/estimate seams, the scheduling engine, concurrency and
server actions, and cross-view UX state. Every candidate defect was then put to two
independent adversarial verifiers: one that traced the code and tried to prove the repro
false, and one that read `docs/ROADMAP.md`, `docs/DOMAIN_RULES.md` and the specs and tried
to show the behaviour was already known, deliberate, or out of phase. 37 candidates, 27
confirmed (24 unique — three were reported twice from different dimensions), 10 refuted.

**No product functionality was added.** Every change corrects a defect. The test count
went from 1191 to 1312; every fix carries a regression test, and three tests that pinned
buggy behaviour were repaired rather than deleted (named below).

Fixed, worst first:

- **The date picker wrote the wrong day for most of the world.** _(critical)_ `DatePicker`
  read UTC calendar fields off `Date` objects `react-day-picker` builds at *host-local*
  midnight, and handed back UTC noon for the selection. Both edges were off by one day in
  every timezone east of UTC — so a due date, and a work block's day, were persisted one
  day early for Europe, Asia and Oceania. Neither test zone the repo runs (UTC,
  America/Los_Angeles) can see it: both are non-positive offsets, where local midnight and
  UTC midnight share a date. `date-picker.test.tsx` now runs the same click under UTC,
  Asia/Kolkata, Pacific/Kiritimati and America/Los_Angeles.
- **Open redirect in `/auth/callback`.** _(high)_ The `next` guard rejected `//` but not
  `/\` or a C0 whitespace character before the second slash, both of which the WHATWG URL
  parser treats as protocol-relative. The candidate is now resolved and its origin compared
  against the request origin.
- **The block editor severed a work or habit block from its parent.** _(high)_ Saving one
  wrote the *resolved* parent title into `calendar_blocks.title`, after which the block
  stopped tracking its task's name — the drift Domain Rule 2 exists to prevent.
- **Reordering a never-reordered task list did nothing visible.** _(high)_ `sort_order`
  defaults to 0, so an equal-order run is the normal case, and no single number can place a
  row inside one. The row was written to the end of the run instead of the drop index.
- **Find Time silently dropped today's whole free window.** _(high)_ `snapInstantUp`
  returned `now` unchanged whenever its *minute* sat on a snap boundary, ignoring the
  seconds and milliseconds it carries; the resulting start was not a boundary instant, so
  the round-trip filter discarded every candidate in the window that begins at `now`. On an
  empty afternoon the dialog reported that nothing fits.
- **A failed mutation blanked the route instead of rolling back.** _(high)_ The one
  optimistic mechanism never caught a *rejected* action — offline, 5xx, aborted, a server
  action missing after a deploy — so React re-threw it and the nearest error boundary
  replaced the page. Domain Rule 11 covers the call that never returns, not only the one
  that returns `{ ok: false }`. Fixed in the hook and at its two sibling sites
  (`useSettings`, Quick Add), with `unstable_rethrow` first so `redirect()` and
  `notFound()` still propagate.
- **Escape committed the edit it was supposed to discard.** _(high, 3 sites)_ `blur()`
  dispatches synchronously, before React re-renders, so the `onBlur` handler still closed
  over the pre-reset draft. Fixed in the task detail sheet, the display-name field and the
  working-hours rows.
- **Bulk actions could act on rows the user could not see.** _(high)_ `selectedIds` was
  never reconciled against the visible rows, so narrowing the list left tasks selected that
  the bar would then Complete, Move or Delete.
- **Four controls dropped keyboard focus to `<body>`.** _(high/medium)_ The task detail
  sheet and Quick Add (opened programmatically, so Radix restored focus to a null trigger),
  the Plan panel toggle, the bulk action bar, and the subtask reorder arrows — each removed
  or disabled itself as its own effect. Domain Rule 10.
- **A work/habit row could be a recurrence override, and one poisoned the whole week
  query.** _(medium)_ `blocks_override_shape_chk` never required `kind = 'event'`;
  `listWindow` then handed such a row to `rowToEventBlock`, which throws.
  `20260906130200_override_kind.sql` closes it.
- **`Add work block` was a permanent dead end for a large task.** _(medium)_ The button
  derived the block's length from the whole remaining estimate with no clamp, exceeding the
  schema's 2880-minute cap, so every click failed identically.
- **A midnight-crossing block could not be saved once its End field was touched.**
  _(medium)_ `<input type="time">` cannot represent 1470, so any interaction collapsed it
  to 30 and the form then refused to save.
- **`bulkSetCompletion` reported total failure after a partial commit** _(medium)_ — one
  RPC per id, each its own transaction — and skipped `refresh()`, so completed tasks kept
  showing as open.
- **Quick Add's Retry minted a fresh UUID** _(medium)_, so retrying a create whose response
  was lost produced a duplicate task. Domain Rule 17: the id identifies the row, not the
  attempt.
- **Find Time blacklisted good candidates.** _(medium)_ `openCandidates` recorded a start in
  its dedup set *before* testing whether the block still fit, so a start rejected in one
  free interval suppressed the same instant in every later one.
- **`XPBar` mismatched on hydration** _(medium)_ — `toLocaleString()` with no explicit
  locale, server-rendered in the top bar on every authenticated route.
- **The tasks skeleton drew the Phase 1 four-section layout** _(medium)_ the page no longer
  has, shifting content several hundred pixels on load.
- **A midnight-crossing block advertised `M` and `R`** _(medium)_ in two accessible
  descriptions although both are no-ops, and the `aria-disabled` that said otherwise was
  being stripped.
- Four low-severity fixes: the optimistic overlay resolved wall-clock spans without the
  inverted-span fallback the server applies (a block in a spring-forward gap rendered
  inverted and contributed negative coverage minutes — now routed through
  `intervalOfSlot`, one implementation instead of three); a hand-edited `?week=` at the
  ends of the `LocalDate` range threw out of a server component; the optimistic completion
  patch left a task's *other* blocks stale for the round trip; a blocked `sessionStorage`
  made the sort and filter controls inoperable rather than merely unpersisted; and the task
  drag ghost printed `135m` where every other surface prints `2h 15m`.

Three tests asserted the defect and were repaired, not removed:
`sorting.test.ts` (asserted the reordered row's number, which sorted it last),
`working-hours-editor.test.tsx` (hand-fired a `blur` in a separate React batch, a sequence
no browser produces, which is what let the Escape defect ship), and
`tasks-view.test.tsx`'s `bulkMoveToProject` stub.

Ten candidates were refuted and are **not** defects — recorded here so they are not
re-reported: `useMidnightRollover` being mounted only on the calendar; unpaginated
repository reads against PostgREST's `max_rows`; the reopen-task control on any completed
block; a completed work block rendering like an outstanding one; calendar mutations
revalidating only their own route; the day-view over-capacity warning appearing twice;
`setAll`'s discarded `headers`; `aria-pressed` on `role="group"` (argued deliberately in a
comment above it); habit-block completion having no pointer route; and the planning
drawer's coverage sentence.

---

## Security audit (Phase 13, 2026-09-09)

A full security sweep of RLS coverage, mutation authorization, server-side XP integrity and
farm resistance, client-bundle secret exposure, and cross-user data reachability. Findings
were reproduced against the live local stack before any fix, and the fixes re-verified the
same way. Cross-user isolation is proved, not asserted, by `packages/db/tests/rls-cross-user.test.ts`
(122 cases: inserts with another user's id, ownership transfers, cross-account foreign keys,
every sanctioned RPC called with another user's id, the ungranted functions, resource-embed
reads, count/id side channels, guarded-column inserts, and the same calls signed out — each
refused with the exact SQLSTATE and each followed by an owner read proving no state changed).
`packages/db/tests/security-hardening.test.ts` runs the XP/farm attacks and shows they fail.

**Fixed** (migrations `20260909120*`, and four app edits):

- **Weekly-goal XP/coin farm (high).** `weekly_goals.week_start` was client-chosen and
  unconstrained, so a client could create one claimable goal per calendar date per metric
  (overlapping windows over the same work) or backfill history and claim it. Now insertable
  only for the caller's current local week, with `week_start`/`metric`/`target` frozen and a
  database target cap.
- **Daily-XP-cap reset via timezone (high) and a check-then-insert race (medium).** The cap
  counted awards in a calendar day resolved in the client-writable `profiles.timezone`;
  switching timezone reopened it (~30x). Now a rolling 24h window under a per-user row lock.
- **Quest multiplication via timezone/week-start sweep (medium).** Now one assignment set
  per real period; `assign_quests` records the assigning timezone and skips overlapping sets.
- **Latent function-exposure hole (medium).** The per-schema default-privilege revoke never
  removed the built-in `PUBLIC EXECUTE`, so any future function was born client-callable; the
  global revoke now closes it. Default sequence privileges revoked from `authenticated` too.
- **`created_at` was client-writable (low)** — now stamped and immutable outside trusted logic.
- **Sign-up account-enumeration (medium)** — a duplicate address now gets the same reply a
  fresh one does. **Session cookies (low)** now `HttpOnly` + `Secure`. **Baseline security
  headers** added (`nosniff`, `frame-ancestors 'none'`/`X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS; `X-Powered-By` off). **Tasks action** no longer forwards raw
  database messages on an unmapped error.

**Verified clean:** RLS is enabled with an owner-scoped policy on all 17 tables including the
join/progress tables; `assert_same_owner` covers every cross-user foreign key; no granted
function accepts a client XP/coin amount; the client bundle contains no secret (not even the
publishable key); `pnpm audit` is clean.

**Accepted risk / follow-ups** (confirmed but low, left with a stated reason):

- **Full script-src CSP.** Only `frame-ancestors` ships; a nonce-based `script-src` needs a
  per-request nonce threaded through `proxy.ts` to cover Next's inline scripts without
  `unsafe-inline`. Tracked, not yet built.
- **`/update-password` needs no reauthentication.** A live session can change the password
  without the current one; gating it to recovery sessions is a follow-up (risk: breaking the
  legitimate recovery flow).
- **Trusted RPCs distinguish 42501 ("not yours") from P0002 ("no such row").** A low-value
  existence oracle for a uuid the caller already holds; unifying the codes would churn ~15
  call sites and the RLS suite for little gain.
- **`profiles.working_hours`/`focus_windows` shape is validated only by the app.** A direct
  PostgREST write can store malformed JSON — self-DoS of the writer's own account only.
- **`config.toml`/`seed.sql` are dev-shaped.** Production must enable email confirmations,
  set the real `site_url`/redirects, and never run the seed or `db reset --linked` against a
  hosted project; the config changes depend on production values not present in the repo.
- **`habit_completion` accepts a ±1-day window in the client timezone** (widenable to ±2 by a
  timezone switch); neutralised for XP by the rolling cap, tightening it risks rejecting
  legitimate near-midnight completions.
- The generated `database.types.ts` still names the ungranted functions; they are refused at
  runtime (proved by the RLS suite), not by the type.

---

## What exists after Phase 13

The phase was run as the spec asks: **inspect everything first, then fix.** Five inspection
lanes with disjoint ownership drove all 18 workflows in headless Chrome (the extension was
not connected; `playwright-core` against the system Chrome was) — signed in as both seeded
accounts, at 1280 and 375 px, in both themes, with persistence checked by reload and by
direct SQL and every optimistic path made to fail on purpose. The 78 findings were written
into this file before a line changed. Six fix lanes then worked the list in priority order
with the same file ownership; the lead applied the cross-lane edits, ran every gate once
over the integrated tree, and wrote this section.

### The two P0s

- **A task dragged out of a scrolled Plan-my-week drawer landed hours from the pointer**
  (CAL-01). dnd-kit's `delta` is scroll-adjusted over *the dragged node's* scroll ancestors,
  so the drawer's `scrollTop` leaked into the drop time — a real row was persisted 3h45
  early. The controller now tracks the pointer itself (a window capture `pointermove`
  listener) and resolves `pointer.y − over.rect.top`; `delta` is only the fallback for an
  activation that carried no coordinates.
- **Quests could not be claimed from the UI** (PROG-01). `quest_assignment_id()` mints ids
  as `md5(...)::uuid`, whose version nibble is random; zod's `z.uuid()` accepts only
  RFC-9562 shapes, so ~90% of live assignments failed validation with "Please check the
  highlighted fields." and a Retry that could never succeed. The schema is `z.guid()` now,
  and the test parses a real hash-shaped id.

### Conventions the P1s settled (apply them; do not invent parallel ones)

- **Focus never lands on `<body>`.** Nine findings were the same defect: a control natively
  disabled while focused, or a surface that closed without handing focus on. The pattern is
  `aria-disabled` + a handler guard, and `useOpenerFocus(open)` now restores focus in the
  commit that closes a sheet or dialog rather than after Radix's exit animation — which is
  also what made `M` after Escape work (the Phase 3 mystery, CAL-08). Rows that disappear
  hand focus to a tab-order neighbour (`tabbableNeighbours`, `focusFirstAvailable`).
- **Touch targets** are systemic, in the primitives: `pointer-coarse:` variants give every
  Button, Input, Select, Toggle, Command item, the Checkbox (a 40×40 hit area around the
  16px box), TaskRow and HabitCard day cell a ≥40px hit area on a coarse pointer without
  changing a desktop pixel. Features fix layout only (wrapping, `min-w-0`, overflow).
- **One live region.** Sonner's container is `aria-live=off`; `toast.success/error/info`
  speak through the Announcer, `toast.xp`/`celebrate` say nothing (ProgressProvider does).
  Never pair `toast.x(message)` with `announce(message)` for one event.
- **Error toasts that carry an action stay until dismissed** and are pressable under a
  modal (the toaster is `pointer-events: auto`; Dialog and Sheet ignore interact-outside
  events from inside it). Quick Add, the only modal that writes, reports failures inline.
- **Validation messages reach the user.** `validationError` falls back to the first field
  message; forms render `fieldErrors` beside the field; a validation failure offers no Retry.
- **Destructive deletes confirm** (task, subtask, bulk, habit) in a Dialog that names the
  count and the cascade, defaults to Cancel, and returns focus to the opener. No undo yet.
- **The rolling 24-hour XP cap is what the UI describes.** "Limits in the last 24 hours" on
  Progress and the focus page's "of 300 points" read the ledger over the same window the
  trigger uses (`xpCapWindow` in `@momentum/core/gamification`); Today's `xpToday` is still
  the local day on purpose — it is the day's earnings, not a cap.
- **A tick on an amount habit records the remainder of its period** (`amountToRecord` in
  `@momentum/core/habits`), never a bare 1 unit that called the day done. Habits and Today
  both use it.
- **Every IANA zone is settable.** Settings' four-entry select is a searchable combobox
  (Popover + Command, no dependency) over `Intl.supportedValuesOf("timeZone")`, validated by
  the same `isIanaTimeZone`. The inert Notifications switches were removed — a control that
  saves nothing is worse than none.
- **Week planning exists below `lg`.** The Plan-my-week drawer renders as a `SideSheet`
  from the calendar header toggle when the viewport is narrow (`useWideViewport`); the
  calendar's sensors are `MouseSensor` (4px) + `TouchSensor` (200ms hold), so blocks move by
  touch and a swipe still scrolls.
- **The recovery email works in any browser.** `supabase/templates/recovery.html` sends a
  `token_hash` link the callback verifies without a cookie; the PKCE branch maps
  `bad_code_verifier` to an honest message. Production must set `site_url`.
- **Reordering a tied list writes** (AUTH-01, the Phase 5 leftover): `reorderTask` takes a
  batch, Quick Add creates one step below the user's lowest row, and a move announces only
  after a write was issued.

### Design audit

Fixed by removal: `rounded-xl`/`rounded-sm` off the radius roles, Tailwind's default
shadows, `duration-100/200`, stray `z-10`s, `text-[0.8rem]`, `ring-[3px]`, `gap-2.5`/`pl-7`
off-scale spacing, the `h-6` button overrides, the /focus explanatory paragraphs, the habit
dialog helper sentences, the sign-up hint, the alpha-faded muted text below AA, the
duplicate-key console error on every /analytics load, the 404 without an `h1`, the /progress
and task-sheet overflow at 375, the clipped `AN`/`PN` time inputs, the /progress skeleton
shift. The design system doc gained a glyph radius role, a touch-target rule and the
HabitCard wrap rule.

### Performance (dev server, Turbopack — measured, not guessed)

Hard load of /today: 30 requests, 495 KB JS, 173 KB document (72 KB flight payload, of which
the shell task index is ≈5 KB), 631 DOM nodes; /calendar 1.08 MB JS, 1303 nodes with 29
blocks; /analytics 3.48 MB JS (recharts loads only there). Soft navigation is exactly one
RSC request per route (23–63 KB) and the `(app)` layout is **not** re-rendered on soft
navigation, so `getShellTaskData`/`getProgressBadge` run once per hard load. A week-view
drag causes ≈2 DOM mutations per pointer move. No client component lacks a browser reason.
Nothing here needed a change; `getShellTaskData` reading completed tasks it then filters is
recorded below as a small win for later.

### Tests

`pnpm test:e2e` is real: 18 Playwright specs (15 desktop, 3 in an iPhone-13 `@mobile`
project; system Chrome; `reuseExistingServer`) walk the 18 workflows against the local stack
in ≈2 min. The unit/component count rose from 2385 to 2500, one regression test per fix. On
the final integrated tree, against a freshly migrated and seeded database:
`MOMENTUM_DB_TESTS=1 pnpm test` → 183 files, 2861 tests, 0 failures (the 361 database cases
included: RLS cross-user proofs, anti-farm attacks, the function-exposure matrix);
`pnpm test:e2e` → 18/18. Both ran through a hand-run kong gateway, because the CLI's own
kong container hangs the Docker daemon on this host — see the known issue for the exact
recipe; the tests themselves are unchanged.

---

## Phase 13 audit findings (2026-09-09)

Recorded **before any fix was made**, as `specs/13-final-audit.md` requires. Five inspection
lanes with non-overlapping ownership (auth/tasks/palette · calendar/planning · habits/focus ·
progress/today/analytics/settings · design/shell/performance) walked all 18 workflows in
headless Chrome against the local stack, signed in as both seeded accounts, at 1280 and 375
px in both themes, verifying persistence by reload and by direct SQL. Evidence, reproduction
steps and the proposed fix for every row are in the audit record; the table is the index.
Status at the end of the phase: **FIXED**, or **RECORDED** (a P2 left with its reason under
"Current known issues"). Nothing is OPEN.

| ID | P | Workflows | Finding | Status |
| --- | --- | --- | --- | --- |
| CAL-01 | P0 | 4, 18 | Dragging a task out of a scrolled Plan-my-week drawer lands the block hours away from the pointer | FIXED |
| PROG-01 | P0 | 13, 16 | Quest claim fails validation for every md5-derived assignment id — quests cannot be claimed from the UI | FIXED |
| AUTH-01 | P1 | 3 | Reordering inside a run of equal sort_order rows writes nothing but announces a move — and every Quick Add task is created at sort_order 0 | FIXED |
| AUTH-02 | P1 | 2, 3, 7 | Failure toast's Retry is unreachable while Quick Add or the detail sheet is open (modal pointer lock + focus trap), and the toast auto-dismisses after 5 s | FIXED |
| AUTH-03 | P1 | 2, 3 | Field-level validation failures surface only as 'Please check the highlighted fields.' with nothing highlighted and no field message | FIXED |
| AUTH-04 | P1 | 3 | Detail sheet drops focus to <body> after almost every commit: every control is natively disabled while any write is in flight, and Enter in the title blurs the field | FIXED |
| AUTH-05 | P1 | 7 | Completing a task from the list with Space drops keyboard focus to <body> | FIXED |
| AUTH-06 | P1 | 7, 3 | On touch devices bulk selection is unreachable and the complete checkbox is a 16×16 target | FIXED |
| AUTH-07 | P1 | 3 | Detail sheet footer overflows the 375px viewport — 'Complete task' is clipped | FIXED |
| AUTH-08 | P1 | 3, 7 | Deleting tasks (sheet, subtask, bulk up to 200) is immediate with no confirmation and no undo; cascades subtasks and work blocks | FIXED |
| AUTH-09 | P1 | 1 | Password-reset link only works in the browser that requested it; elsewhere it fails with the misleading 'That link has expired or was already used' | FIXED |
| CAL-02 | P1 | 5, 7 | Focus drops to <body> after a keyboard move to another day, after Delete, and after removing an occurrence | FIXED |
| CAL-03 | P1 | 4, 18 | Scheduling an UNSCHEDULED task with S or F leaves focus on <body> | FIXED |
| CAL-04 | P1 | 5, 6 | Blocks cannot be moved by touch: the drag stalls after the first move because the block shell has touch-action auto | FIXED |
| CAL-05 | P1 | 18, 4 | Plan-my-week drawer and its toggle are hidden below 1024px, so week planning is unreachable on mobile and tablet | FIXED |
| CAL-06 | P1 | 4, 5 | Editing an occurrence's description or colour is silently discarded on Save | FIXED |
| CAL-07 | P1 | 4 | 'Add work block' in the task sheet drops focus to <body> (native disabled while pending) | FIXED |
| DES-01 | P1 | 13, 14 | /progress overflows horizontally at 375px: quest and goal actions are clipped | FIXED |
| DES-02 | P1 | 1, 15, 16 | Top-bar controls are 28×28px on mobile (navigation trigger, quick add, notifications, account menu) — below the 40px touch floor | FIXED |
| DES-03 | P1 | 9 | Habit day cells (the primary record-a-day control) are 20×20px buttons with a 4px gap on touch devices | FIXED |
| HAB-01 | P1 | 10 | Launching focus from a task or block never pre-selects the task: page passes `?task=` but the query reads `params.taskId` | FIXED |
| HAB-02 | P1 | 10, 11, 12 | A rejected focus action (offline/aborted) escapes the transition and blanks /focus into the (app) error boundary — no toast, no Retry | FIXED |
| HAB-03 | P1 | 9 | An amount-per-week habit is recorded as 1 unit and marked Done from the habits page and from Today | FIXED |
| HAB-04 | P1 | 8, 9, 12 | Focus lands on <body> after the habit dialog/sheet closes, after Archive/Delete from the row menu, and after Finish/End on /focus | FIXED |
| HAB-05 | P1 | 9 | aria-disabled day cells still act: a quick double press records the day and then removes it | FIXED |
| HAB-06 | P1 | 8, 9 | Habit rows at 375px: 20px day targets, 28px icon buttons, names truncated to ~90px, consistency and XP hidden | FIXED |
| PROG-02 | P1 | 16, 13 | A quest claim on /today that rejects (offline, 5xx) replaces the whole route with the error boundary | FIXED |
| PROG-03 | P1 | 16, 17, 13 | Settings offers only four timezones; users outside them cannot set the profile timezone that every date boundary depends on | FIXED |
| PROG-04 | P1 | 13, 14 | /progress overflows horizontally at 375px — right edge of every quest/goal/achievement row is clipped (Claim, Done, Set a goal, Remove, dates) | FIXED |
| PROG-05 | P1 | 13, 14 | Weekly-goal dialog drops keyboard focus to <body> on Escape and after 'Set goal' | FIXED |
| PROG-06 | P1 | 16, 13 | Today and Progress controls are far below the 40px touch-target floor on mobile (16×16 checkboxes, 24px-high Claim/Remove/Wear/Set-a-goal buttons) | FIXED |
| PROG-07 | P1 | 16 | Settings 'Notifications' switches look persisted but hold session state only — toggling silently saves nothing | FIXED |
| AUTH-10 | P2 | 3, 2 | Escape inside a sheet field closes the whole sheet; Escape in Quick Add discards the typed title silently | FIXED |
| AUTH-11 | P2 | 2 | Q in a project view does not seed the project, while the page's 'New task' button does | FIXED |
| AUTH-12 | P2 | 2, 3, 15 | Interactive controls are 28–32px tall on mobile (view tabs, toolbar, sheet buttons, palette rows, auth inputs) | FIXED |
| AUTH-13 | P2 | 3 | DurationInput keeps aria-invalid after blur reverts the text to a valid committed value | FIXED |
| AUTH-14 | P2 | 1 | After a failed sign-in or a reset request, focus lands on <body> | FIXED |
| AUTH-15 | P2 | 3 | During a row drag the translated row is drawn at 40% opacity over the target row, so both titles overprint | FIXED |
| CAL-08 | P2 | 5 | Known issue diagnosed: M is ignored right after the block editor closes because Radix restores focus only after the ~200 ms exit animation | FIXED |
| CAL-09 | P2 | 4, 5 | Block editor labels a habit block or an event occurrence as 'Task' with a work-block helper sentence | FIXED |
| CAL-10 | P2 | 4 | A task estimated under 15 minutes seeds an invalid default in the Schedule dialog, while a drag creates 5-minute blocks | FIXED |
| CAL-11 | P2 | 5, 6, 7 | Keyboard move/resize announce 'Moved…'/'…is now…' before the server has agreed; Undo restores silently | FIXED |
| CAL-12 | P2 | 6 | The editor cannot make a block run past midnight (end earlier than start is rejected instead of read as next day) | FIXED |
| CAL-13 | P2 | 5 | Keyboard move/resize candidate label is drawn over the block's own title | FIXED |
| CAL-14 | P2 | 4, 5, 18 | Calendar header controls are 28px tall at 375px (below the 40px touch target the audit requires) | FIXED |
| DES-04 | P2 | 17, 9 | HabitHeatmap keys weekday labels by their one-letter text → duplicate keys 'T' and 'S', React error on every /analytics load and every habit detail sheet | FIXED |
| DES-05 | P2 | 15, 16 | Mobile navigation drawer opens with focus on the 'New task' button, not the first navigation link | FIXED |
| DES-06 | P2 | 1 | The 404 page has no h1 and no page title | FIXED |
| DES-07 | P2 | 13, 14 | /progress loading skeleton does not match the page: 14px header + 8px level-card shift on arrival | FIXED |
| DES-08 | P2 | 16 | /settings skeleton: 'Focus windows' section is 38px in the skeleton and 70px on the page (32px shift for Appearance and Notifications) | RECORDED |
| DES-09 | P2 | 16 | Working-hours time inputs are too narrow: Chrome renders '09:00 AN' / '05:00 PN' | FIXED |
| DES-10 | P2 | 10 | Focus page carries four paragraphs of explanatory copy under its three controls | FIXED |
| DES-11 | P2 | 8 | Habit form dialog: description line plus two helper sentences under fields, in a 512×559 modal | FIXED |
| DES-12 | P2 | 2, 3 | Task list renders the keyboard-shortcut hint line on touch devices at 375px | FIXED |
| DES-13 | P2 | 8, 9 | Habit rows at 375px truncate the habit name to ~65px ('Read 20 p', 'Language') | FIXED |
| DES-14 | P2 | 15, 3, 9 | Radii outside the three roles: rounded-xl on the command palette and dialogs, rounded-sm on kbd/chip/links, rounded-[2px]/[1px]/[4px] literals | FIXED |
| DES-15 | P2 | 3, 15 | Shadows outside the two elevation tokens in the vendored primitives | FIXED |
| DES-16 | P2 | 3, 15 | Off-token durations and z-indexes remain in the vendored primitives | FIXED |
| DES-17 | P2 | 2, 3, 13 | Arbitrary values and off-scale spacing in primitives and features | FIXED |
| DES-18 | P2 | 9, 3 | Alpha-faded muted text below AA: habit 'ahead' day letters at 2.54:1 (light) and 'free' dots at 1.8:1; priority-select and grip icon at /60 | FIXED |
| DES-19 | P2 | 1 | Sign-up name field carries a helper sentence that the label could say in one word | FIXED |
| HAB-07 | P2 | 9 | Daily habits read "3 of 7 times" — the week's progress noun is wrong for per-day boolean habits | FIXED |
| HAB-08 | P2 | 12 | "X of 300 points from focus today" is measured over the profile-local day while the cap is now a rolling 24-hour window | FIXED |
| HAB-09 | P2 | 10 | Empty custom length reads "Start 0 minutes" | FIXED |
| HAB-10 | P2 | 8 | Habit create mints a fresh client id on every submit attempt, so a resubmit after a lost response creates a duplicate habit | FIXED |
| HAB-11 | P2 | 8 | "Delete" in the habit row menu deletes the habit, its completion history and its blocks with no confirmation or undo | FIXED |
| HAB-12 | P2 | 8 | Target and Points inputs cannot be cleared while typing (`Number(v) \|\| 1`) | FIXED |
| PROG-08 | P2 | 17 | Analytics heatmap renders duplicate React keys ('T','S') — a console error on every /analytics load | FIXED |
| PROG-09 | P2 | 13 | 'Today's limits' panel and '+N XP today' measure a local calendar day while the cap is a rolling 24-hour window | FIXED |
| PROG-10 | P2 | 16, 13 | After a timezone change across a date boundary the user has no visible quests for up to a day ('No quests today') although a set exists | RECORDED |
| PROG-11 | P2 | 13 | Progress page failure toasts offer no Retry, and `run` silently drops a submit while another write is pending | FIXED |
| PROG-12 | P2 | 17 | Analytics range control announces itself as a radiogroup but arrow keys move focus without changing the selection | FIXED |
| PROG-13 | P2 | 16 | Settings time inputs clip their meridiem ('09:00 AN', '05:00 PN') at the fixed w-28 width in Chrome | FIXED |
| PROG-14 | P2 | 13, 14 | Every XP/celebration toast is announced twice: sonner's own live region plus the Announcer | FIXED |
| PROG-15 | P2 | 16, 9 | Ticking a per-week amount habit on Today records 1 unit and marks the day 'Done' ('41m of 2h') | FIXED |
| PROG-16 | P2 | 13, 14 | Quest/goal progress labels and 'N XP to level M' are not set in tabular numerals | FIXED |
| PROG-17 | P2 | 17 | 'Consistency by day' draws a ~70×90px grid inside a 200px-tall figure, leaving most of the panel empty | FIXED |
| PROG-18 | P2 | 16 | Reschedule is announced in 12-hour time ('7:15 AM – 8:15 AM') while the page shows 24-hour ('07:15') | FIXED |

Totals: 2 P0 · 30 P1 · 46 P2 (78): 76 fixed, 2 recorded (PROG-10 needs a migration; DES-08 is
data-dependent). Every workflow 1–18 was exercised in a browser; per-workflow coverage notes are in
the audit record.

---

## Current known issues

- **On this host the Supabase CLI's kong container hangs the Docker daemon.** _(Phase 13,
  environment, worked around)_ After `supabase stop`, every `supabase start` created the
  database, applied the migrations and seeded, then hung forever creating `supabase_kong_*`;
  `docker start`/`inspect`/`rm` of that one container hung too, across four Docker Desktop
  restarts, a re-pulled image (the daemon had logged `image list should return a summary:
  supabase/kong:2.8.1`) and a fresh project id. A throwaway kong container from the same
  image, on the same network and port, runs fine — so it is the CLI's container definition,
  not the image, the port or the name. The recipe that produced this phase's green runs:
  `supabase start -x studio,postgres-meta,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,kong --ignore-health-check`
  (the CLI's health probe goes through kong, so without the flag it tears the stack down),
  then a gateway from the same image with a three-route `kong.yml` (`/auth/v1/` → auth:9999,
  `/rest/v1/` → rest:3000, `/rest-admin/v1/` → rest:3001, `strip_path`) copied into the
  container and published on 54321, no key-auth — so the app and the test harness use the
  legacy anon JWT (`ANON_KEY` from `supabase status -o env`) as the publishable key for the
  run. `pnpm db:reset` works against that stack. The stack was left running under project id
  `momentum13` with the gateway `momentum_gateway`; `config.toml` is back to `momentum`, so
  tear it down with `docker rm -f` on those five containers rather than `supabase stop`.
  On a host whose Docker is healthy none of this applies.
- **Quests can vanish for up to a day after a timezone change** _(Phase 13, PROG-10,
  recorded)_ `ensure_quest_assignments` returns the set whose period contains "today" in
  the *new* zone, while the existing set (kept, correctly, by the anti-multiplication
  guard) is keyed to the old zone's window — so /today can read "No quests today" although a
  set exists. The fix is a migration: return every assignment whose window, evaluated in
  the zone it was assigned in, contains `now()`, rather than re-deriving the window from
  the profile. No SQL shipped this phase.
- **The settings skeleton assumes zero focus windows** _(Phase 13, DES-08, recorded)_ so a
  profile with two windows shifts 32px on arrival. Data-dependent: the count is not known
  before the read. Every other route's skeleton matches its page.
- **Calendar block checkboxes are 12×12 on touch.** _(Phase 13)_ A 40px hit area does not
  fit a 15-minute block; the block's own menu offers the same action. Not in the findings.
- **At 375px a habit row's target line still truncates its progress suffix** ("… 3 of 7
  days"); the name is now in full. _(Phase 13, cosmetic)_
- **E2E specs must await the commit, not the paint.** _(Phase 13, test-authoring rule)_
  Every write is optimistic, so a spec that reloads on the visual cue aborts the in-flight
  action (`The destination stream closed early` in the dev log) and can read a page that
  predates the write. `committed()` in `e2e/fixtures.ts` waits for the action's response;
  Playwright's `networkidle` was not a sufficient signal.
- **Each e2e run leaves `E2E-` rows** on both seed accounts (tasks, a block, a habit and its
  completion, a one-minute focus session, an XP event). `pnpm db:reset` clears them; run
  it before `MOMENTUM_DB_TESTS=1 pnpm test`, which asserts on the seeded rows.
- **`getShellTaskData` reads every non-archived task and then filters to open ones** (44
  rows → 14–20 on the seeded account) on every hard load. A status filter in `tasks.listFor`
  is a small, safe win; `packages/db` was lead-only this phase and it was left alone.
- **The full script-src CSP and `/update-password` reauthentication** are still the accepted
  risks from the security sweep above.

- **Not installed on Safari, and Lighthouse was not run.** _(Phase 12, open)_ Everything
  that could be checked without those two was: Chrome 152 was driven over the DevTools
  protocol against production builds, and `Page.getInstallabilityErrors` — the API behind
  Lighthouse's installability audit — returned an empty array, with `Page.getAppManifest`
  reporting no parse errors. What that does **not** cover is macOS Safari's "Add to Dock"
  and iOS Safari's "Add to Home Screen", which read a different subset of the metadata
  (`apple-touch-icon`, `apple-mobile-web-app-capable`) and cannot be emulated; nor a real
  device's safe areas, which were measured with insets injected through CDP rather than on
  hardware; nor Lighthouse's full report. The per-browser notes above are from each
  browser's documentation, not from an install.
- **The offline page duplicates seven design tokens as literal hex.** _(Phase 12, by design,
  worth knowing)_ `public/offline.html` is a static file, so it cannot reach the oklch
  variables in `packages/ui/src/styles/globals.css`; it also cannot depend on a hashed CSS
  chunk, because it is the one surface that must render with no network. The comment in the
  file names the seven tokens and says to change them in the same commit. The same is true
  of the two colours in `lib/pwa/app-identity.ts`, for the same reason: a `<meta>` and a
  manifest cannot reference a CSS variable either. A test pins the manifest's pair.
- **Turbopack's persistence cache does not survive this volume.** _(Phase 12,
  environment, not the application)_ A second `next build` without deleting `.next` fails
  with `Failed to open database … invalid digit found in string`. The working tree is on an
  external volume that writes AppleDouble `._` sidecars, which the repository already
  works around in `.gitignore`, the ESLint ignores and the Vitest excludes. `rm -rf
  apps/web/.next` before a rebuild is the workaround; no application code is involved.

- ** _(RESOLVED in Phase 13: walked at 1280 and 375 in both themes, with a timezone switch)_`/today` has not been driven in a real browser.** _(Phase 9, open)_ The page was
  rendered against the live database for both seeded accounts and its markup read back —
  one `h1`, the sections in order, At Risk present for one account and absent for the
  other — but the Chrome extension was not connected this session, so nothing was clicked,
  no theme was switched and no width was measured. The 375px layout is argued from the
  markup (single column below `lg`, `minmax(0, …)` grid tracks, `min-w-0` on every flex
  child, wrapping control rows, no fixed width above 44px) rather than measured, and the
  same is true of dark mode. **This is the first thing to check when a browser is
  available**, alongside the Phase 6-8 surfaces which have never been walked either.
- **Rendering `/today` writes.** _(Phase 9, by design, worth knowing)_ The read calls
  `ensure_quest_assignments` so that a user who has never opened `/progress` still sees
  today's quests. It is idempotent and resolves the period from the profile, exactly as
  `getProgressPage` has done since Phase 8 — but a GET that writes is worth stating rather
  than discovering. The database suite was re-run immediately after a `/today` render and
  all 326 assertions passed, so the write does not perturb what the suite asserts.

- **The whole function surface was reachable by any signed-in account.**
  _(Phases 2-8, FIXED in Phase 8, found by the first live run)_
  `20260906121200_grants.sql` closed the surface with `alter default privileges in schema
  public revoke execute on functions from public, anon, authenticated`. That statement does
  not reach functions created by later migrations: every function Phases 6, 7 and 8 added
  carried the built-in `PUBLIC EXECUTE` grant, and `public.assert_caller` escaped only
  because `20260906130100_guard_inserts.sql` revoked it by name. Concretely,
  `award_xp(user, source, source_id, amount, reason)` - which takes the amount as an
  argument - was callable from the browser, as were `award_coins`, `reconcile_xp`,
  `evaluate_achievements` and `end_focus_session`. **Domain Rule 6 was true in every line of
  application code and false in the database.** The Phase 8 migration now revokes execute by
  name from every function in `public` and re-grants the twenty-three sanctioned ones;
  `packages/db/tests/gamification.test.ts` asserts the live matrix and
  `gamification-rules.test.ts` asserts the migration still does it. **A default-privileges
  revoke is not a security boundary; state the matrix explicitly.**
- **`xp_rule()` could never have been created.** _(Phase 7, FIXED in Phase 8)_ It is
  `language sql`, so Postgres resolves its body at creation, and it referenced
  `xp_rule_unknown()` which the same file defined *below* it - `42883` on the first
  migration, aborting the reset before anything later ran. The helper is now defined first,
  with a comment saying why the order is load-bearing. A `plpgsql` body would not have been
  checked this way, which is exactly why the mistake was invisible.
- **`remove_habit_completion` returned a row of nulls, not null.** _(Phase 6, FIXED in
  Phase 8)_ It is declared `returns public.habit_completions` and did `return null` for "no
  such day" - but a NULL composite expands to a row of nulls through PostgREST, and the
  mapper then threw on `completion_date.trim()`. Its own comment described the intent
  correctly and the mechanism did not honour it. It is now `returns setof`, which says
  "nothing" by returning no rows.
- **Completing a habit block deleted a completion the user had made by hand.** _(Phase 6,
  FIXED in Phase 8)_ `record_habit_completion`'s upsert set
  `source_block_id = coalesce(c.source_block_id, excluded.source_block_id)`, so the first
  block to touch a day *claimed* a row it had not created - and `uncomplete_habit_block`
  then deleted it. That is the opposite of what Domain Rule 13 says un-completing a block
  does. `source_block_id` is now absent from the `DO UPDATE` list: a row created by a block
  keeps its block, a row created by hand stays unowned.
- **Transition tables cannot be combined with column lists or multiple events.**
  _(Phase 8, resolved during the run)_ `after update of status ... referencing new table`
  is rejected with `0A000`, and so is `after insert or update ... referencing new table`.
  The achievement triggers are therefore six rather than four, without column lists, and
  the narrowing moved *inside* the evaluator as `evaluate_achievements(user, keys)` - which
  is a better place for it: a task update now checks two conditions rather than six, and
  never the one that walks a habit's whole history.
- **The database suite ran its files in parallel against one shared account.**
  _(Phases 6-8, FIXED in Phase 8)_ Every integration test signs in as the same seeded user
  and asserts on that account's rows - its ledger total, its level, its per-day XP caps - so
  parallel files raced each other, and the suite was only ever green because it had never
  run. `packages/db/vitest.config.ts` now sets `fileParallelism: false`. Two cleanup bugs
  surfaced with it: `focus.test.ts` deleted *every* focus session of the owner, seeded
  history included, which is what `rls.test.ts` asserts exists; and `habits.test.ts` left
  its ledger rows behind, which walked the account into Phase 8's per-day habit cap
  part-way through the file. Both now clean up exactly what they created, and the suites
  that assert against a day's caps prune that day first.
- **A multi-row insert into `xp_events` would under-apply the daily cap.** _(Phase 8, by
  design, worth knowing)_ `cap_xp_event()` is a `before insert` row trigger, and rows
  inserted earlier in the *same statement* are not visible to it, so an
  `insert … select` of several awards could exceed the day's cap. No application path does
  that — the table has no insert grant at all, and every trusted function writes one row per
  transaction — and the seed is the only thing that inserts in bulk. If a future phase ever
  awards in bulk, the cap has to move into that statement.
- **Phase 7 has been run against a live database.** _(Phase 7, resolved)_
  `20260907130000_focus_functions.sql` applies and `packages/db/tests/focus.test.ts` passes,
  after the `xp_rule` ordering fix above. Its cleanup was also over-broad; see the parallel
  entry under Phase 8.
- **`start_focus_session`'s parameter order differs from `docs/DATABASE.md`'s original
  row.** _(Phase 7, deliberate)_ `planned_minutes` leads and `id` is second, because the
  three optional parameters have to follow the required one. PostgREST calls by name, so no
  caller is affected; the document's row is updated to match.
- **A pause and its resume in the same transaction would leave the pause open.**
  _(Phase 7, low)_ `now()` is the transaction's start time, so two lifecycle calls always
  get different values and `focus_pauses_order_chk` (`resumed_at > paused_at`) is satisfied
  by construction. `end_focus_session` guards the degenerate case anyway — it closes an open
  pause only when `now()` is strictly later — and a pause left open at the end contributes
  nothing, because the elapsed helper clips every pause to the horizon. There is no caller
  that can reach this today; it is written down so nobody batches two RPCs into one
  transaction without reading this line.
- **The seed has no session dated today.** _(Phase 7, cosmetic)_ `supabase/seed.sql` writes
  eight weeks of sessions at `today - n` for `n` from 1, so a freshly seeded account's
  "Focused today" tile reads zero until the user runs one. The week and per-project totals
  are populated. It was left alone rather than adjusted, because the RLS suite counts rows
  in these tables.

- **Phase 6 has been run against a live database.** _(Phase 6, resolved)_
  `20260907120000_habit_functions.sql` applies and `packages/db/tests/habits.test.ts` passes,
  after the two defects the run found (see Phase 8's entries above).
- **The habits page reports "best run" over twelve weeks, not over all time.**
  _(Phase 6, by design, worth knowing)_ `getHabitsPage` reads completions for the heatmap
  range only, and the streak is computed over what it read. Reading a user's whole history
  to render a list row is a cost that grows for ever; when Phase 10 has an analytics read
  that already spans it, the all-time figure belongs there.

- ** _(RESOLVED in Phase 13: AUTH-01 — batch reorder landed, shim deleted)_An interior drop in a never-reordered task list now writes nothing.** _(Phase 5 audit,
  medium)_ The audit fixed half of the reorder defect: the dragged row no longer teleports
  to the bottom of an equal-`sort_order` run. The other half needs the caller to write
  several rows — `sortOrdersForMove` in `@momentum/core/tasks` is exported, tested and
  ready, and `sortOrderForMove` is now a shim that returns `null` where one write cannot
  express the move. Completing it is a four-file change in `apps/web`: `reorderTaskInput`
  in `features/tasks/schemas.ts` becomes a batch (`{ orders: [{ id, sortOrder }] }`, bounded
  at 200 to match the existing bulk limit), `reorderTask` in `features/tasks/actions.ts`
  writes every entry under the user's RLS, and `use-task-mutations.ts` passes the batch
  with every touched id. The database contract does not change — still one
  `double precision sort_order` column. Delete the shim and its `describe` block when this
  lands. Drops at the top and bottom of a tied list work today.
- **Blocks whose title was already frozen by the old editor are not repaired.** _(Phase 5
  audit, low)_ The fix stops new writes; any `calendar_blocks` row with `kind <> 'event'`
  and a non-empty `title` still shows that string, and the field is read-only for exactly
  those kinds, so there is no UI path to clear it. A one-line repair migration
  (`update public.calendar_blocks set title = '' where kind <> 'event' and title <> ''`)
  belongs with whichever phase next touches the table. No seeded or demo row is affected.
- **`snapInstantUp` has one residual case, roughly an hour a year.** _(Phase 5 audit, low)_
  An instant carrying seconds whose minute is already on the snap grid *and* which sits in
  the second pass of a fall-back overlap still returns unchanged, so it is not a boundary
  and the round-trip filter drops it. Closing it needs a `startOfMinute` in
  `@momentum/core/time`, which needs the module-internal `epochOf`; doing the arithmetic in
  `scheduling/intervals.ts` instead would be the ad-hoc date maths Domain Rule 5 forbids.
  `docs/SCHEDULING.md` §9 already documents fall-back-night readings as legitimately
  unofferable.
- ** _(RESOLVED in Phase 13: AUTH-04/08 — the confirm dialog hands focus to the subtask field)_Deleting a focused subtask still drops focus to `<body>`.** _(Phase 5 audit, low)_ The
  audit closed the two reorder arrows, which turn `aria-disabled` as a result of being
  pressed. The Delete button removes its own `<li>`, which needs a sibling-row handoff
  rather than the same treatment.
- **The wall-clock-span → instants rule still has two server-side copies.**
  _(Phase 5 audit, technical debt)_ `spanInstants` in `features/tasks/actions.ts` and
  `features/calendar/actions.ts` are hand-written and currently byte-for-byte correct
  against `intervalOfSlot`. Both optimistic copies were routed through the shared function;
  these two were left because they are correct and changing them is not defect repair. They
  are the duplication Domain Rule 5 warns about, and the next phase that touches either
  should collapse them.
- **`vi.fn()` stubs in `tasks-view.test.tsx` are a landmine.** _(Phase 5 audit, test debt)_
  `bulkDeleteTasks` and `bulkSetCompletion` resolve to `undefined` and the hook reads `.ok`
  off it, which throws inside the transition. The existing cases survive only because they
  assert synchronously; `bulkMoveToProject` was fixed because a new test awaits it. The
  next async assertion added there will need the other two fixed first.
- **jsdom cannot detect "a control disables itself while focused".** _(Phase 5 audit, test
  debt)_ It does not implement the browser's blur-on-disable, so `document.activeElement`
  cannot discriminate. The regression tests pin the mechanism instead — `aria-disabled`
  present, native `disabled` absent — and say so in a comment. Anyone adding such a control
  has to do the same.
- ** _(RESOLVED in Phase 13: the file is deleted)_`TASK_SECTIONS` in `lib/placeholder-data.ts` is now dead.** _(Phase 5 audit)_ The tasks
  skeleton was its last consumer. Its type `PlaceholderTaskSection` goes with it. The
  module's own docblock already says it disappears as features gain real queries; `NEXT_UP`
  is still used by Today.
- **`unstable_rethrow` is, by name, an unstable Next API.** _(Phase 5 audit)_ It is the only
  public way to tell a framework control-flow throw from a real one, and it is imported in
  three places. A rename upstream is a small change, but it is a coupling worth knowing
  about.
- **`useSettings` captures `previous` from the render's snapshot.** _(Phase 5 audit,
  pre-existing, low)_ Two overlapping writes to the *same* settings key could roll back to
  the intervening optimistic value rather than the server's. No audit finding names it and
  fixing it changes behaviour, so it was left.
- ** _(RESOLVED in Phase 13: walked in Phase 13)_The audit fixed 24 defects across 40 files and none of it was walked in a browser.**
  _(Phase 5 audit)_ `pnpm typecheck`, `pnpm lint`, `pnpm test` (1312 passing) and a cold
  `next build` are green, and every fix carries a regression test — but the local Supabase
  stack still could not be started this session, so `packages/db/tests/` has not run against
  a database and the new migration has not been applied to one. The focus-handoff fixes in
  particular assert a mechanism rather than an outcome, because jsdom cannot observe the
  outcome. **Walk it before Phase 6**, and run `MOMENTUM_DB_TESTS=1 pnpm test`.

- **The local stack is disk-hungry and the startup disk here is small.** A first
  `supabase start` pulls several GB of images; this machine had 8.7 GB free and finished
  with 1.2 GB, and an earlier attempt filled the disk outright. `supabase start -x
  studio,postgres-meta,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor`
  brings up only what this phase needs (db, auth, rest, kong, mailpit) and is what the
  verification run used. `docker builder prune` reclaims more than image pruning does.
- **The Supabase CLI is not a workspace dependency.** `pnpm db:*` shells out to whatever
  `supabase` is on the PATH (2.111 or newer). The npm package downloads a large platform
  binary in a postinstall script, which this repo's `ignoredBuiltDependencies` policy would
  gate anyway; the CLI version does not affect the schema.
- ** _(RESOLVED in Phase 13: CAL-08 — Radix restored focus after the exit animation; `useOpenerFocus(open)` restores it in the closing commit)_After the block editor closes with Escape, the block regains focus but `M` was
  ignored once in a real browser.** _(Phase 3)_ Observed twice, with waits between each
  keystroke: the focus ring returns to the block, `M` does not enter move mode, and the
  next arrow key navigates to a neighbouring block instead. The same sequence works from
  focus that did not come through the editor — verified end to end in Chrome, candidate
  outline and all, with the moved row confirmed in Postgres — and seventeen component
  tests cover the mode. So the keyboard model is sound and something about the focus Radix
  restores is not; the cause is not established and is written down rather than guessed at.
  The block is still reachable and movable by focusing it any other way.
- **A block that crosses midnight cannot be dragged or keyboard-moved.** _(Phase 3)_ It
  renders in both day columns, and each column holds a clipped half; committing a drag from
  a half would rewrite the block to the length of that half. Such blocks stay focusable,
  openable, completable and deletable, and their times are edited in the block editor, so
  nothing is unreachable. The fix, if it is ever worth it, is a whole-block duration on
  `ItemSegment`, not a change to the drag handler.
- **All-day items open the block editor as if they were timed.** _(Phase 3)_ They render in
  their own strip rather than as a column-height block, but the editor has no all-day mode,
  so saving one writes the times the form shows. `docs/ARCHITECTURE.md` §9 deferred the
  all-day strip in the first place; the editor half belongs with whichever phase takes
  all-day events seriously. Until then, editing one is the one way to get a wrong row.
- ** _(RESOLVED in Phase 13: the Playwright suite exists and walks the 18 workflows)_`pnpm test:e2e` does not exist.** `docs/ARCHITECTURE.md` §13 lists Playwright as first
  used in Phase 3, for the drag and keyboard paths. The keyboard paths are covered by
  component tests and were walked in a real browser; the pointer-drag path is covered by
  unit tests of its pure candidate maths and by the same browser walk, but not by an
  automated end-to-end test. Add the harness with the first phase that needs a second
  workflow tested end to end, or before Phase 13's audit.
- **Three overlapping blocks in a week column are about 28px wide.** _(Phase 3)_ The
  padding halves and the time label drops out below the container-query thresholds, which
  buys back roughly a word — but a 7-day view at 1440px cannot make three concurrent
  events comfortable, and neither can any other calendar. Day view is the answer, and it
  is one click away.
- ** _(RESOLVED in Phase 13: the task manager was walked end to end in Phase 13)_Phase 4 was not walked in a browser.** _(Phase 4)_ Every other gate is green —
  `pnpm typecheck`, `pnpm lint`, `pnpm test` (806 passing) and a full `next build` — but
  the local Supabase stack could not be brought up this session. The Docker daemon did not
  answer `docker info`, `docker ps` or `supabase status` at all — those probes hung until
  the host killed them for **memory** pressure — with 6.2 GB free on the startup disk (this
  file already records the stack needing several GB and having filled the disk once). So
  the blocker was the machine, not the schema or the code: retry on a host with memory and
  disk headroom rather than trying to work around it. So the task manager has not been exercised against real
  rows, and the things only a browser finds — focus behaviour after a Radix sheet closes,
  hydration of the `useSyncExternalStore` preferences, the drag's feel at the row heights it
  actually renders at — are unverified. **Walk it before Phase 5 builds on it.** The
  seeded demo account already contains the multi-block essay the spec describes, so the
  walk is: `supabase start`, `pnpm db:reset`, `pnpm dev`, sign in, and check the essay
  shows three blocks and "1h 15m of 2h 15m scheduled".
- ** _(RESOLVED in Phase 13: the drawer, Find Time and the settings editors were walked in Phase 13; the db suite ran)_Phase 5 was not walked in a browser either.** _(Phase 5)_ `pnpm typecheck`, `pnpm lint`,
  `pnpm test` (1191 passing) and a cold `next build` are green, but `docker info` hung
  again this session (killed after 30 s) with 4.1 GB free on the startup disk, so the
  Supabase stack could not be started and `packages/db/tests/planning.test.ts` has not run
  against a database. The drawer, the Find Time dialog and the settings editors are
  covered by component tests that drive the real handlers, but the things only a browser
  finds — the drag's feel with the drawer beside it, Radix focus restoration after the
  single-dialog handoff, the workload bars at 320px — are unverified. **Walk both phases
  before Phase 6:** `supabase start`, `pnpm db:reset`, `pnpm dev`, sign in as the demo
  account, open the calendar, drag the essay from OVERDUE or DUE THIS WEEK onto Tuesday and
  watch PLANNED rise and UNSCHEDULED WORK fall in the same frame; press `F` on a row and
  schedule the first suggestion; then run `MOMENTUM_DB_TESTS=1 pnpm test`.
- **Every second `pnpm build` fails on Turbopack's persistent cache.** _(Phase 4)_
  Reproducible and deterministic on this checkout: a build against an empty `.next`
  succeeds every time, and the next build against the warm cache fails every time with
  `Failed to open database / Loading persistence directory failed / invalid digit found in
  string`. Confirmed by alternating four builds. `rm -rf apps/web/.next` before each build
  is the workaround, and CI (which always starts cold) never sees it.

  It is environmental, not application code: the error comes from Turbopack's Rust cache
  layer parsing its own metadata, nothing in the build output changes, and the same
  alternation reproduces regardless of which files were touched. The most likely cause is
  the exFAT volume this repo lives on — the same volume `next dev` already warns is a slow
  filesystem. Worth re-testing from a local-disk checkout before filing anything upstream;
  until then, `pnpm build` needs a cold cache here.
- **Creating a project has no UI.** _(Phase 4)_ Projects are read everywhere — the
  sidebar, Quick Add, the detail sheet, the bulk bar — and the seed supplies four, but
  nothing creates, renames or archives one. No spec owns the project manager; the sidebar's
  former "New project" button now opens Quick Add rather than pretending, and a task can
  always be filed later. Give it to whichever phase first needs a project the seed does not
  have.
- **Archived tasks are written but never shown.** _(Phase 4)_ The detail sheet archives a
  task and `listFor` excludes archived rows, so archiving is currently one-way through the
  UI. `setArchived(client, id, false)` exists and is the whole of the un-archive path; it
  needs a view to be reachable from. Deleting is reversible only by re-creating.
- **The timezone-mismatch banner is not built.** `docs/ARCHITECTURE.md` §10 describes a
  non-blocking notice when the device timezone differs from the profile. _(Phase 5)_ The
  settings action it needed now exists (`updateProfileSettings` in
  `features/settings/actions.ts`); the banner itself is still unbuilt, and belongs with
  whichever phase next touches the shell.
- **macOS AppleDouble sidecars break the toolchain on this checkout.** The repo lives on an
  exFAT volume, where macOS writes a `._name` file beside any file with extended
  attributes. `._foo.test.ts` matched the vitest include globs and `._foo.tsx` matched
  ESLint's and Prettier's, so all three failed on binary metadata. `._*` is ignored in
  `.gitignore`, `.prettierignore`, `eslint.config.mjs` and all four vitest configs. They
  reappear as files are touched; the ignores make that harmless, and `dot_clean .` removes
  them. On Linux CI they never exist.
- **Sign-out needs JavaScript**, unlike the other auth forms. It is a form posting to a
  server action, but it lives inside the account dropdown, and Radix mounts a menu's
  content only once the menu opens. The form is still the right shape — signing out is a
  mutation — and the browser walk covers it; it is simply not a no-JavaScript path, and the
  comment in `top-bar.tsx` says so now.
- **`XPBar` still renders placeholder XP.** `profiles.xp` is real and guarded, but turning
  it into a level and a progress bar needs `level_for_xp()`, which Phase 8 owns and Phase 8
  finalises. The seed sets `xp` from its ledger and derives `level` with the proposed curve
  so the number is plausible rather than invented.
- **Email confirmation is off locally** (`supabase/config.toml`, `[auth.email]
  enable_confirmations = false`), so signup signs you straight in. The signup action already
  handles the other case — when no session comes back it tells the user to check their
  email — but that path is only exercised with confirmations on.

- **Toolchain held below latest on purpose.** TypeScript 6.0.3 (not 7) because
  `typescript-eslint` caps at `<6.1`; ESLint 9.39.5 (not 10) because `eslint-plugin-import`,
  pulled in by `eslint-config-next`, caps at 9. Both are recorded with their reasons in
  `docs/ARCHITECTURE.md`; revisit when upstream ranges move.
- **Slow filesystem warning.** `next dev` reports a slow filesystem for this checkout on
  the external volume. Compile times are acceptable; a local-disk checkout would be faster.
- **Fonts need the network at build time.** `next/font/google` downloads Geist during
  `next build`. If offline builds become necessary, switch to the `geist` npm package.
- **Markdown is not format-checked.** `*.md` is in `.prettierignore` so authored specs and
  docs are not rewritten by the formatter.
- **Build scripts ignored for `sharp` and `unrs-resolver`** (`pnpm-workspace.yaml`).
  Neither is needed in dev or build here. Allow `sharp` if self-hosting with `next/image`
  optimization.
- **Notifications are inert.** The bell shows a tooltip saying there is nothing, so the
  shell is walkable without pretending the feature exists. _(Phase 2: sign-out is real.
  Phase 4: quick add is real and bound to `Q`; "New project" became "New task" and opens
  it. Phase 11: the top bar's Search button opens the real command palette, and its
  shortcut hint now reads ⌘K or Ctrl K depending on the keyboard.)_
- **Today still renders placeholder tasks, from its own copy of the Phase 1 list.**
  _(Phase 4)_ Phase 4 replaced the shared `TaskList` with a database-backed, keyboard-driven
  one whose props are entirely different, and Today is Phase 9's to rebuild. Rather than
  leave Today broken, the Phase 1 list moved to
  `features/today/components/placeholder-task-list.tsx`, next to its only remaining
  consumer, with the name saying what it is. Phase 9 deletes that file.
- **`TaskRow` in `@momentum/ui` now has one consumer: Today's placeholder.** _(Phase 4)_
  The task manager's row is `features/tasks/components/task-list-row.tsx`, which could not
  wrap `TaskRow` — the row itself is the tab stop and the drag source, so wrapping would
  have nested a control inside a control. The two share their priority and due-tone
  vocabulary but not their code. If Phase 9 does not want `TaskRow`, delete it then.
- **`TaskRow`'s meta columns are container queries, not viewport ones.** The same row is
  full width on Tasks and 384px wide in Today's Next-up column; project and estimate drop
  out below `@md` / `@lg` of the row's own width. Any surface that embeds `TaskRow` in a
  narrow column gets this for free.
- **Four primitives are deferred** — `DurationInput`, `DatePicker`, `PrioritySelect`
  (Phase 4) and `XPToast`, `AchievementToast` (Phase 8). Each needs data that does not
  exist yet; building them now would mean writing domain logic with no consumer. They are
  marked in `docs/DESIGN_SYSTEM.md`.
- **The vendored shadcn components were edited** to use the `z-*` token utilities instead
  of the `z-50` they ship with, to drop the sheet's hard-coded `max-w-sm` (which silently
  capped the 480px side sheet at 384px), and to remove the overlay `backdrop-blur`
  (ambient blur is a listed failure mode). Re-running `shadcn add --overwrite` for
  `sheet`, `dialog`, `popover`, `dropdown-menu`, `select` or `tooltip` will undo these.

---

## Architectural decisions

Decisions made and frozen. Append one line per decision; detail lives in
`docs/ARCHITECTURE.md`. Do not silently reverse anything listed here.

- Web is the canonical product; desktop wraps it — by loading the deployed app
  (remote content), never a static export or a forked implementation.
- A task may own multiple work blocks; due date ≠ scheduled time.
- All timestamps stored UTC; all boundaries resolve in the user's profile timezone.
- XP is computed server-side; the client never asserts an amount.
- Scheduling logic is deterministic and testable — no LLM in the scheduling path.
- _(Phase 0)_ pnpm workspaces monorepo; packages consumed as TypeScript source; no
  Turborepo until CI caching pays for it.
- _(Phase 0)_ Three packages: `@momentum/core` (framework-free domain, subpath modules),
  `@momentum/db` (generated types, mappers, repositories), `@momentum/ui` (design system).
- _(Phase 0)_ Schema is the source of truth → generated `Database` types → hand-written
  domain types, joined by explicit mappers; enum parity is a compile-time test.
- _(Phase 0)_ `Instant` and `LocalDate` are branded ISO strings; ids are plain strings.
- _(Phase 0)_ One `calendar_blocks` table with `kind ∈ {event, work, habit}` and
  per-kind check constraints; `tasks` never carries scheduling columns.
- _(Phase 0)_ Server components by default; client islands enumerated in
  `docs/ARCHITECTURE.md` §5; no Cache Components in v1.
- _(Phase 0)_ Reads in `features/*/queries.ts`, mutations in `features/*/actions.ts`
  returning `ActionResult`, revalidation with `refresh()`/`revalidatePath`; route handlers
  only for non-RSC consumers; no browser Supabase client in v1.
- _(Phase 0)_ No client cache library and no global store; contexts for settings and the
  active focus session; URL for navigational state.
- _(Phase 0)_ One optimistic mechanism, `useOptimisticAction` on `useOptimistic`, with
  client-generated ids and toast + retry on failure.
- _(Phase 0)_ dnd-kit core with day-column droppables, pure geometry in
  `@momentum/core/calendar`, and keyboard move/resize through the same sensor path.
- _(Phase 0)_ date-fns 4 + `@date-fns/tz` behind `@momentum/core/time`; `useNow` for all
  time-dependent rendering; dual-timezone test runs.
- _(Phase 0)_ Constrained recurrence (`daily` | `weekly`, interval, byWeekday, until/count,
  timezone), expanded at query time, overrides stored as rows; only events recur.
- _(Phase 0)_ RLS on every table with `(select auth.uid())`; ledgers client-read-only;
  trusted writes only through `security definer` SQL functions with a trusted-flag guard on
  protected columns; no Edge Functions; service role never in a request path.
- _(Phase 0)_ Vitest projects (node for packages, jsdom for ui/web, env-gated database
  integration suite) plus Playwright for e2e.
- _(Phase 0)_ shadcn `radix-nova` on Radix primitives; tokens are CSS variables consumed
  through semantic utilities only.
- _(Phase 0)_ TypeScript 6.0.3 and ESLint 9.39.5 until the lint toolchain supports 7 / 10.
- _(Phase 0)_ No tags on tasks in v1.
- _(Phase 1)_ Sidebar collapse persists in a cookie read by the server, not `localStorage`
  — revises `docs/ARCHITECTURE.md` §7; the reasoning is in that file's decisions log.
- _(Phase 1)_ `@momentum/ui` may import `@momentum/core` (types and enum constants only),
  so `ProjectDot` remains the single mapping from a `ProjectColor` to a token.
- _(Phase 1)_ `PageContainer` joins the primitive list: the page gutter and section rhythm
  are a token decision, not something each route repeats.
- _(Phase 1)_ `PageHeader` renders the `h1` at every width but hides it visually below
  `md`, where the top bar shows an `aria-hidden` section name instead. One title per page,
  at every width.
- _(Phase 2)_ No OAuth providers in v1. The spec allowed them "only if it costs nothing
  extra", and every provider costs a real client id and secret per environment, a consent
  screen to maintain, and a second account-linking path to reason about. Email and password
  is the whole surface; adding a provider later changes no schema.
- _(Phase 2)_ Timezone validity is `pg_timezone_names`, not the `now() at time zone …`
  probe the design proposed — that probe also accepts POSIX offset strings like `UTC+5`,
  which are not what "a valid IANA timezone" means. `@momentum/core/time` validates the
  same way on the client, via `Intl.DateTimeFormat`.
- _(Phase 2)_ `?next=` after sign-in is matched against the navigation registry in
  `lib/nav.ts` rather than accepted as any same-origin path. It closes the open-redirect
  shape completely, keeps the value a typed `Route` so a stale destination is a compile
  error, and costs only the query string, which a login has no business carrying.
- _(Phase 2)_ Phase 2 ships the schema and `handle_new_user()`; every other trusted
  function arrives with the phase that owns its feature. The guards are in place from the
  first migration, so a guarded column is unwritable by anyone until there is a sanctioned
  path through it — which is the right order.
- _(Phase 2)_ Auth actions take `FormData`, not a parsed object, so the forms submit
  without JavaScript and `useActionState` is an enhancement rather than a requirement.
- _(Phase 2)_ Grants are written out per table and the *default* privileges for future
  objects are revoked, so RLS is never the only thing standing between a client and a
  ledger table.
- _(Phase 2)_ An empty optional form field means "absent", not "empty string". `FormData`
  cannot tell the two apart and HTML has no way to express the difference, so the actions
  normalise at the boundary (`optionalField`) rather than teaching every schema to accept
  `""`. Found by submitting the signup form before hydration, which is exactly the case the
  FormData decision above exists to support.
- _(Phase 2)_ `profiles.xp` is reconciled from the ledger in one place, at the end of the
  seed, rather than updated by each block that awards. A running total maintained in more
  than one place is a total that drifts, and it drifted by 50 XP the first time it ran.

---
- _(Phase 3)_ `@momentum/core/time` is built on `Intl.DateTimeFormat`, not date-fns 4 +
  `@date-fns/tz` — revises `docs/ARCHITECTURE.md` §10. `TZDate`'s gap/overlap
  disambiguation is not the rule the product needs, so it would have been overridden
  anyway; going direct writes the rule out in `fromLocal` where it can be read.
- _(Phase 3)_ No dnd-kit `KeyboardSensor`; keyboard move and resize are explicit `M` / `R`
  modes — revises §9. That sensor activates on Space and Enter, which §9's own keyboard
  table assigns to "toggle completion" and "open the block".
- _(Phase 3)_ The grid's window is 05:00–24:00 by default and grows to fit the week's
  blocks. The spec's "roughly 5:00 AM – 12:00 AM" is the right default and the wrong hard
  limit: a scheduling product that hides a commitment is worse than one that scrolls.
- _(Phase 3)_ Block create and edit are a `SideSheet`, not the popover specs/03 names.
  `docs/DESIGN_SYSTEM.md` already lists `SideSheet` for "block edit", and a popover
  anchored inside a scrolling grid moves with it and covers the time being read.
- _(Phase 3)_ Server actions take wall-clock `{ date, startMinutes, endMinutes }`; the
  client never asserts an instant. The profile timezone is the server's, and `fromLocal`'s
  DST rule then lives in exactly one place.
- _(Phase 3)_ One optimistic overlay over the item list, driven by patches — revises §8's
  example, which shows one hook per action. Seven hooks over one array would each hold a
  different view of it and the grid can only render one.
- _(Phase 3)_ `complete_task` / `uncomplete_task` ship now as state transitions only. The
  block's completion control is a Phase 3 acceptance criterion and the guarded columns had
  no sanctioned path; the XP award is Phase 8's and inventing an amount would be guessing
  at a number Domain Rule 6 makes the server's single source of truth.
- _(Phase 3, extends Domain Rule 13)_ Un-completing a block reverses exactly what
  completing it did, carried by an explicit `also_uncomplete_task` flag. Otherwise a
  control could complete a task and leave no way to undo it until Phase 4 exists.
- _(Phase 4)_ **A view is computed on the client, from one server read of every task.**
  The spec defines a view as "a filter over the same data"; filtering on the server and
  again on the client would be two implementations of one definition, and the one the tests
  cover would not be the one the user sees. It also makes optimistic completion move a task
  between views with no code that moves it. Bounded by one person's own task list.
- _(Phase 4)_ **Sort and filter live in `sessionStorage`, not the URL** (§7): the spec asks
  them to persist within a session, and nobody links to a sort order. Read through
  `useSyncExternalStore`, whose server snapshot is the default — seeding `useState` from an
  effect instead would be a cascading render and a one-frame flash of the wrong sort.
- _(Phase 4)_ **Missing values sort last in both directions.** A task with no due date has
  not "got the largest due date"; reversing the sort should not bury the tasks that have
  deadlines under the ones that do not.
- _(Phase 4)_ **The detail sheet has no Save button.** Every field commits on blur or
  Enter as its own optimistic mutation. A sheet with a Save button has a second state the
  user must track, and closing it with unsaved edits loses work.
- _(Phase 4)_ **Task actions revalidate `/calendar` and `/today` as well as refreshing.**
  A work block created from the detail sheet is a row the week grid draws, and completing a
  task changes how its blocks render there. One surface's mutation genuinely invalidates
  the other's read (§6); a calendar still showing a block just deleted from the sheet is
  the silent divergence Domain Rule 11 forbids.
- _(Phase 4)_ **List reordering uses `@dnd-kit/core` directly, not `@dnd-kit/sortable`.**
  Each row is both draggable and droppable and the drop index comes from the row it lands
  on, which is a dozen lines against a new dependency for a single vertical list
  (CLAUDE.md: do not introduce a dependency when existing code can reasonably solve the
  problem).
- _(Phase 3)_ `DndContext` is given an explicit `id`. dnd-kit derives its own from a
  module-level counter, which does not survive SSR — see the browser findings above.

- _(Phase 5)_ **`@momentum/core/scheduling` works in instants and elapsed minutes**, with wall
  clock only at the edges through the server's own conversion rule — see the decisions log
  in `docs/ARCHITECTURE.md`.
- _(Phase 5)_ **Find Time treats overlap as a filter first and a ranking criterion second.**
  An open slot outside working hours beats a double booking inside them; overlapping
  candidates are offered only when nothing open fits. This reads specs/05's "within
  working hours before minimal conflicts" as an ordering among open slots rather than a
  licence to suggest a double booking, and is recorded in `docs/SCHEDULING.md` §5.
- _(Phase 5)_ **Ranking is lexicographic over the five criteria; nothing is weighted.** Every
  ordering is explainable by the first field that differs. Two candidates per day at most
  while other days have any.
- _(Phase 5)_ **Off-hours suggestions are limited to 07:00–22:00** (`SUGGESTION_WINDOW`);
  configured working windows are honoured wherever they lie.
- _(Phase 5)_ **AVAILABLE counts today in full and is not clock-based.** The server renders
  it and the first client paint must match; Find Time and the insufficient-time check,
  which run on interaction, take `now`.
- _(Phase 5)_ **PLANNED sums every commitment that occupies time; AVAILABLE subtracts merged
  coverage.** Events count as planned time — everything competes for the same week.
- _(Phase 5)_ **Capacity, conflicts and Find Time run on the client over the optimistic
  week**; the server sends the sections and each task's coverage outside the range.
- _(Phase 5)_ **Insufficient-time warnings are bounded to deadlines inside the displayed
  range.** Beyond it the engine cannot see the free time and would warn falsely.
- _(Phase 5)_ **One task, one drawer section** — OVERDUE → DUE THIS WEEK → UNSCHEDULED,
  decided on the server; subtasks are excluded, as the task manager's views already do.
- _(Phase 5)_ **HABITS omitted (Phase 6 not shipped); WEEKLY GOALS read-only (Phase 8 owns
  progress and claiming).**
- _(Phase 5)_ **"Pick a time instead" swaps content inside one Radix dialog** rather than
  closing one and opening another, because Radix restores focus on a macrotask and a
  close-and-open would strand a keyboard user on `<body>`.
- _(Phase 5)_ **Settings persist through one partial-patch action, one field per write**;
  overlapping windows are merged by the schema rather than rejected.
- _(Phase 5)_ **Every drawer string lives in `features/planning/copy.ts`** and is scanned by a
  test for the vocabulary Domain Rule 7 forbids; the engine's explanations and warnings
  are scanned the same way in `core`.
- _(Phase 9)_ **Today's domain logic lives in `features/today/agenda.ts`, not in
  `@momentum/core`.** It is composition over shapes the *application* resolves — the
  calendar's `CalendarItem`, the conflict engine's warnings, the page's own task rows — and
  `@momentum/core` may not depend on any of them (docs/ARCHITECTURE.md §2). It follows
  `features/calendar/projection.ts` and `features/planning/live.ts`, which exist for the
  same reason, and it is pure and unit-tested like both.
- _(Phase 9)_ **`/today` reads two days, and renders one.** The extra day exists so the
  conflict engine can judge a deadline that is not today's; the timeline drops everything
  with no segment on today. Reading one day would have made "due soon" mean "due before
  midnight", and reading a week would have put a week's blocks on the page that opens
  fastest.
- _(Phase 9)_ **Overdue rows are derived on the client; the two engine warnings are sent by
  the server.** A warning needs working hours and interval arithmetic and is stable between
  renders; "this task's deadline has passed" is a fact about a row the overlay can change.
  Splitting them is what makes At Risk clear in the same frame as the completion that
  cleared it, without running the conflict engine in the browser.
- _(Phase 9)_ **At Risk shows overdue, then insufficient time, then overlaps**, in that
  order regardless of the order the warnings arrived in — a rough ordering by how much of
  the day is already spent, fixed here so a row cannot jump between renders.
- _(Phase 9)_ **The greeting is decided once, on the server, and does not change under an
  open tab.** The page already re-renders at the user's local midnight, which is the
  boundary that matters; a greeting that flipped at noon would be a re-render nobody asked
  for.
- _(Phase 9)_ **`useNow()` is used uncorrected, as the calendar's now-line uses it.** The
  focus timer corrects the device clock against `serverNow` because it displays a
  countdown derived from database timestamps; past/current/future at minute resolution does
  not need it, and correcting it here alone would make Today and Calendar disagree about
  the same minute.
- _(Phase 9)_ **The level and XP bar appear on Today as well as in the top bar.** specs/09
  asks the header for them, and below `sm` the top bar shows only "Lv N" — so on the width
  the page is designed for, it is additive rather than duplicated. It is one row with
  today's XP beside it, never a tile and never a banner (Domain Rule 7).
- _(Phase 9)_ **The greeting is repeated visually below `md` and marked `aria-hidden`.**
  `PageHeader` hides its `h1` visually at that width and `TopBar` shows the section name
  instead; the greeting and the date are content on this page rather than chrome, so they
  are shown by the same arrangement `TopBar` uses — one `h1` in the accessibility tree, at
  every width.

## What exists after Phase 10

- **The aggregation layer, as its own tested module.** `@momentum/core/analytics` is
  framework-free, clock-free and reused three times per page load: period construction,
  the three bucketing rules (day, week, hour), focus, task, estimate, habit and block
  aggregations, the insight gate, and `summariseAnalytics` as the one front door Phase 14
  calls. 117 tests, run under both process timezones, including a 7-day window that is
  167 hours across a spring-forward day and 169 across a fall-back one, an hour axis that
  never produces the hour a clock skipped and gives the repeated hour both passes, and a
  week grid that does not shift across a DST weekend.
- **The three windows from one read.** `/analytics` reads ninety days once and aggregates
  it into 7, 30 and 90; the range control is client state, so switching costs no fetch and
  the three windows cannot disagree about a day.
- **Six visualizations**, each in a `<figure>` named by its own heading, with the chart
  marked `aria-hidden` and the same array rendered beside it as a real `<table>` kept
  `sr-only`. The table is server-rendered, so the page's content does not depend on
  JavaScript; the chart mounts after hydration into a placeholder of its exact height.
- **Planned against actual, never conflated.** Both sides are summed over the *same*
  completed tasks — the ones carrying an estimate and recorded minutes — and the tasks
  that carry only one are counted and named under the chart rather than dropped. Four
  tests exist purely to make a substitution fail.
- **Insights that are gated, not hedged.** Four deterministic kinds, each with a declared
  minimum sample size and a noise floor, suppressed entirely below it. On the seeded
  account this is visible end to end: 7 and 30 days produce nothing, and 90 days produces
  exactly one earned sentence. Two vocabulary guards — one over the produced sentences in
  `core`, one over the comment-stripped source of the whole web feature — fail on causal
  connectives and on any word that judges the user.
- `@momentum/db` gained one read, `blocks.listWorkBetween`, covered by
  `blocks_user_start_idx`.
- **Verified against live data.** Both seeded accounts rendered in their own timezones —
  the 30-day window starts a day apart for New York and London, which is Domain Rule 4
  resolving "today" per profile — and a newly signed-up account renders the designed empty
  state with no figures and no range control. Every chart colour was measured against the
  page background from the OKLCH tokens: the lowest ratio is 3.26:1 in light and 6.02:1 in
  dark, all above their WCAG thresholds.

### Known issues

- **Not driven in a real browser.** The extension was not connected, so hover tooltips,
  the Recharts render itself and the two themes as *drawn* are unverified by eye. The
  contrast numbers above are computed from the tokens, and the data is verified through
  the server-rendered tables, but nobody has looked at the page.
- **`lib/placeholder-data.ts` is now fully unused** and can be deleted; Phase 10 was the
  last consumer. Left in place rather than deleted in a phase that was not scoped to it.
- **The heatmap is not Recharts.** Chart 4 uses the design system's `HabitHeatmap`, which
  already encodes state by shape as well as fill and writes every cell's date and state as
  text. A charting library would have traded that for import consistency.

## What exists after Phase 11

- **The parser, as its own core module.** `@momentum/core/parser` is deterministic,
  framework-free and clock-free: one string plus the `today` the caller resolved in the
  profile timezone, and out come a title and at most four values. **No model, by design** —
  an LLM here would be slower, non-deterministic and worse at "essay tomorrow 60m p1
  #school", which is what people actually type.
- **One rule, which is why the hard cases work.** Metadata is a *trailing run*: the parser
  reads tokens from the end and stops at the first that is not metadata. So "read p1 of the
  paper" keeps its page number, "Write the tomorrow section" keeps its word, and "Read
  chapter 3 today #school" gets a date and a project while the 3 stays in the title —
  because a bare number is never a duration, only `15m`, `1h`, `1h30m` and their neighbours
  are. A weekday resolves to the *next* such weekday, strictly after today, and "next
  friday" is absorbed whole rather than leaving "next" behind in the title.
- **Nothing typed is ever discarded.** Conflicting metadata (a second date, a second
  duration) stops the scan rather than overwriting or dropping: the rightmost wins and the
  loser stays visible in the title. An unknown `#tag` is text, because Quick Add does not
  create projects. A cut takes the whitespace that separated it and nothing else, so the
  user's own spacing survives. 57 parser tests, run under both process timezones,
  including a property that every non-whitespace character of the input is accounted for.
- **Parsing is refusable.** Each recognised value is a removable chip under the field.
  Removing one — or setting the control that value was filling — *returns its words to the
  title* and hands the field to the control. One owner per field, always, and the way back
  is always the same one.
- **The command palette, from a typed registry.** `features/palette/` renders a list and
  calls `run`; it knows nothing about tasks, habits or focus sessions. A feature declares
  its commands in its own `features/<feature>/commands.ts` and the registry composes them,
  so adding a command is one object literal and touches no palette internals. Navigation
  commands are *derived* from `lib/nav.ts`, which means a route added there is reachable by
  ⌘K on the same commit.
- **One ranked list over four kinds of thing.** A deterministic fuzzy scorer
  (`fuzzy.ts`, subsequence with prefix, word-start and contiguity bonuses, case- and
  diacritic-folded) ranks commands, tasks and projects together, and the section holding
  the best match is listed first — so typing a task title selects that task and Enter opens
  it. Recent and frequent commands surface first when nothing has been typed, from a
  `localStorage` map that degrades to "no history" rather than to an error, because the
  palette is the way to *reach* the product and is the last thing that may fail to open.
- **Two interactions from anywhere, twice over.** `Q` opens Quick Add; ⌘K → "Add task" does
  the same. `Complete task` and `Schedule task` drop into a task picker whose consequence
  is declared by the task manager, and completion goes through the same trusted action the
  checkbox uses (Domain Rule 15). Nothing in the palette writes XP or a timestamp.
- **Creation commands that own no surface navigate to one.** "Add event" and "Add habit"
  carry `?new=event` / `?new=habit`; the page's island opens its editor once and replaces
  the URL without the intent, so a reload or a back button cannot reopen a dismissed
  dialog. "Start focus session" lands on `/focus` with the setup panel ready — a link that
  started a timer would start one every time it was followed.
- **Accessibility as the shape of the thing, not a pass over it.** cmdk's combobox gives
  the input `aria-activedescendant` over a `listbox` of `option`s; Radix traps focus; the
  shared `useOpenerFocus` puts the user back on the control they opened it from, because a
  palette opened by a keyboard chord has no trigger for Radix to restore to (Domain Rule
  10). Result counts are announced through the application's one live region, debounced so
  a fast typist hears the answer rather than the queue.
- **The shell pays no extra query.** `getShellTaskData` already read every task row for the
  sidebar's counts; the palette's index is the five columns it needs, narrowed from those
  rows. Verified on the wire: `/today`, rendered for the seeded account against the live
  database, carries the task summaries in its payload.
- `@momentum/ui` gained `weekdayLong` on `formatLocalDate`, and `CommandDialog` now renders
  its title *inside* the dialog content — it previously sat beside it, putting an sr-only
  "Command Palette" in the accessibility tree of every page that mounted one.

### Known issues

- **Not driven in a real browser.** The extension was not connected, so the dialog as
  drawn, the two themes, pointer hover and the 375px layout are argued from the markup and
  from 59 palette tests rather than seen. Every keyboard path in the acceptance criteria is
  covered by the component suite in jsdom.
- **⌘K is ignored while another dialog or sheet is open.** Radix marks the rest of the page
  `aria-hidden` behind a modal, and stacking the palette on that is a trap rather than a
  shortcut — the same rule Quick Add's `Q` follows. The palette's own chord still closes it.
- **The palette's task index is open tasks only.** Completing, scheduling and opening are
  the three things its commands do, and none is a question anyone asks of a finished task.
  A "reopen task" command would need the index widened.
- **"Schedule task" opens the task's detail sheet** rather than a scheduling dialog of its
  own. The sheet is where a task's 0..n work blocks live (Domain Rule 2); a second
  scheduling surface would be a second thing to keep in step with the first.

## What exists after Phase 12

- **A manifest that is actually reachable.** `app/manifest.ts` is static by construction and
  served at `/manifest.webmanifest`: `id`, name, description, `start_url: /today`,
  `scope: /`, `display: standalone`, a `display_override` chain that deliberately omits
  `browser` **and** `window-controls-overlay`, categories, and five icons. The single most important line of the phase is not
  in it — it is in `proxy.ts`, where `manifest.webmanifest`, `sw.js` and `offline.html` are
  now exempt from the auth matcher. A browser fetches the first two **without credentials**,
  so before that change the manifest was a 307 to `/login` and the app was simply not
  installable, with no error anywhere to say so. All three were verified against a running
  production build as an unauthenticated client: 200, `application/manifest+json`, and the
  document itself.
- **Icons from one mark, generated and checked in.** `apps/web/scripts/generate-icons.mjs`
  draws a rising line and rasterises six PNGs plus two SVG sources. `any` and `maskable`
  are separate files, never one file with both purposes: a maskable icon carries 10% of
  padding that Android crops, so reusing it as `any` renders small and floating. The
  maskable mark is drawn at 54.7% of the canvas, whose corners sit inside the 80%-diameter
  safe circle — asserted in a test that reads the SVG rather than trusting the comment.
  Generation is on demand, not part of `next build`: `sharp` is a devDependency, so
  installability never depends on an image pipeline succeeding on a deployment target.
- **A service worker built around one rule: never serve an old bundle.** `public/sw.js`
  caches **no HTML at all**. Navigations go to the network (with navigation preload) and
  fall back to the offline page; a 4xx or 5xx is returned as-is, because the server's own
  error page is more truthful than "you are offline". Only `/_next/static/*` — content-
  hashed, so a hit can never be stale — plus the offline page and the icons are cached, and
  a failed response is never stored. Everything else passes through untouched: non-GET,
  cross-origin, RSC payloads (`?_rsc=` or `RSC: 1`), route handlers, `/_next/image`. A
  worker that answered a mutation from a cache would be the silently swallowed failure the
  spec forbids, so the routing table is one pure function and it is tested directly.
- **An update path with no way to strand a user.** The page registers `/sw.js?v=<build>`
  with `updateViaCache: "none"`; `next.config.ts` computes the stamp once per build (commit
  SHA where a deploy platform provides one, else `git rev-parse`, else a timestamp) and
  inlines it through `env`, so every client in a deployment agrees and every deployment
  differs. The worker never calls `skipWaiting()` on its own — a waiting worker is
  announced in a toast that does not expire, and only the user's "Reload" posts
  `SKIP_WAITING`. `controllerchange` then reloads exactly once, and only when the page had a
  controller to begin with: the first worker claiming an uncontrolled page is not an update
  and must not flash. A registration that is already `waiting` at page load is offered too.
  In development nothing is registered and anything already registered is unregistered.
- **`/version`, because `registration.update()` cannot see a deploy.** This was a hole found
  while verifying the phase, not designed in. `update()` re-fetches the URL the worker was
  registered under, and `public/sw.js` is byte-identical across builds — so for a tab loaded
  before a deploy that request answers "unchanged" forever. Next 16 does not rescue it
  either: a soft navigation fetches an RSC payload, not a document, so the page can run the
  bundle it was loaded with for as long as it stays open. The periodic check therefore asks
  the server what build it is serving (`app/version/route.ts`, `no-store`, exempt from the
  proxy) and, when the answer differs, registers *that* build's worker URL — which is
  exactly what the new build's page would have done, and which starts the ordinary
  install → prompt → reload path. Verified end to end: a tab was left open on one build
  while another was built and deployed under it, and on regaining focus it was offered the
  new version and landed on it, with the old caches gone.
- **A designed offline page that cannot render bare.** `public/offline.html` is
  self-contained — inline CSS, an inline mark, no bundle, no font fetch, both themes via
  `prefers-color-scheme`, safe-area padding — because it is the one surface that must
  render with zero network, and a hashed CSS chunk that missed the cache would leave it
  unstyled. It retries on click and automatically on `online`.
- **Honesty about offline, in three places.** The offline page says Momentum stores the
  week on the server, has no offline copy, and queues nothing. `OfflineNotice` — a
  `role="status"` overlay on every route, top-centre because toasts own the bottom-right,
  `pointer-events-none` so it can never eat a click — says the screen may be out of date and
  that changes will not save. A test asserts the wording *and* asserts the absence of
  "sync", "queue" and "saved locally", because that claim is the kind of thing a
  well-meaning copy edit adds back. It is a **strip in each frame's column**, not an
  overlay: the first version floated at the top of the viewport so one mount in the root
  layout could serve every route, and a screenshot at 393px showed it covering the top bar
  outright — the level indicator and the navigation trigger behind a two-line pill.
  `pointer-events-none` meant they could still be clicked, which is worse than useless when
  they cannot be seen. A frame that is exactly `h-dvh` with one scrolling child has no space
  to lend an overlay, so the notice takes a row of its own: 32px at 1440, one line, and
  `<main>` gives it back the moment the connection returns.
- **Offline mutations already failed visibly, and now do everywhere.** No new mechanism:
  `useOptimisticAction` has caught a rejected call and turned it into the `unavailable`
  toast since Phase 3, and the worker's passthrough rule is what keeps that true with a
  worker installed. The gap Phase 12 closed is the four auth forms, which post through
  `useActionState` and therefore re-throw a rejection into render — they had no boundary, so
  signing in with no connection reached `global-error.tsx`. `app/(auth)/error.tsx` catches
  it and says what happened. Wrapping the actions in a client function would also have
  worked, at the cost of the progressive enhancement those forms exist for.
- **Installed-window polish.** `viewportFit: "cover"` plus `black-translucent`, and three
  design-system utilities that give the space back: `safe-frame` on the app frame (top and
  sides), `safe-scroll-bottom` on `<main>` (so the inset lands after the last row rather
  than shortening the scroller forever), and `safe-overlay` on every sheet and on the
  signed-out frame, which sit outside the frame's padding entirely. `<ThemeColor />` rewrites
  the *content* of both media-scoped `theme-color` tags once next-themes resolves — appending
  a third, media-less tag would lose, because the browser takes the first tag whose media
  matches.

### Per-browser limitations

Stated from what each browser documents, **not from an install** — see the note at the top
of this file.

- **Chrome / Edge (macOS, desktop).** The full path: manifest, `beforeinstallprompt`,
  standalone window, and deep links opening in the installed window once the user enables
  "open supported links" for the app. Window-controls-overlay is deliberately not offered:
  declaring it turns it on, and the frame does not reserve `env(titlebar-area-*)`. This is
  the target the acceptance criteria describe.
- **Safari (macOS 14+).** "Add to Dock" installs from the manifest and honours `name`,
  icons and `start_url`, but Safari has no install prompt, so installation is only ever
  user-initiated from the share menu. Deep links do **not** route into the installed window.
- **Safari (iOS/iPadOS).** "Add to Home Screen" only; no prompt and no manifest `display`
  handling — standalone comes from `apple-mobile-web-app-capable` / `mobile-web-app-capable`,
  which is why both are emitted. Only `apple-touch-icon` is read, never the manifest icons.
  Storage for a home-screen app is evicted after roughly seven days without a launch, so the
  offline page can be gone on a cold return; the worker reinstalls it on the next online
  launch. `theme-color` is read on iOS 15+.
- **Firefox (desktop).** No installation at all. The service worker, the offline page and
  the offline notice all work; nothing else in this phase applies.
- **Everywhere.** A service worker requires a secure context, so all of it is inert over
  plain HTTP on anything but `localhost`.

## Open questions

None blocking. Decisions deliberately delegated to the phase that owns them:

- **Phase 8:** the final level curve and the first 30 thresholds (proposed curve in
  `docs/DATABASE.md`, `level_for_xp`); whether coins get their own ledger (v1: no).

---

## Session log

One line per implementation session: date, phase, model/effort, outcome.

| Date       | Phase | Model / effort   | Outcome                                                                                                   |
| ---------- | ----- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| 2026-09-05 | —     | —                | Repository scaffold, docs and specs authored                                                              |
| 2026-09-06 | 0     | Fable 5.1 / xhigh | Architecture, schema, design tokens, and domain-rule extensions decided; workspace scaffold running with typecheck, lint, test, build, and dev green |
| 2026-09-06 | 1     | Opus 5 / high    | App shell, all seven routes with realistic placeholders, full token layer and the primitive library; every acceptance criterion verified in a headless browser at 1440 and 375 in both themes; typecheck, lint, test and build green |
| 2026-09-06 | 2     | Opus 5 / xhigh   | Schema as 13 migrations with RLS, guards and explicit grants; auth (signup/sign-in/sign-out/reset) with a profile trigger; `@momentum/db` mappers and repository; `@momentum/core/time` scalars; seed with two accounts; 47 unit tests green and 121 RLS/signup assertions written. Blocked on a local database: the startup disk filled during the Supabase image pull, so migrations, type generation and the integration suite are unverified |
| 2026-09-06 | 2     | Opus 5 / xhigh   | Local stack brought up and Phase 2 closed out: migrations applied to an empty database and re-applied from scratch, `database.types.ts` regenerated from the schema (no drift from the placeholder), RLS and signup suites run for real (154 assertions), and signup → sign-out → sign-in → password reset walked end to end. Fixed three defects a database was needed to find: null GoTrue token columns in the seed, signup rejected before hydration over an empty `timezone` field, and a seed XP total 50 short of its own ledger with five tables the neighbour account had no rows in |
| 2026-09-06 | 3     | Opus 5 / ultracode | Weekly calendar built in four parallel lanes over a lead-owned seam: `@momentum/core` gained `time`, `calendar` and `recurrence` (run under two process timezones); the board renders, drags, resizes, creates and completes by pointer and by keyboard; eight server actions with one optimistic overlay and rollback; the completion functions opened the guarded columns for the first time. 628 unit tests and 181 database assertions green, and the whole surface walked in a real browser. Fixed a `splitByLocalDay` contract defect that produced an inverted span on a spring-forward day, a dnd-kit SSR hydration mismatch on every draggable, and two block-legibility defects at 15 minutes and at three-across. A five-dimension adversarial review round then produced thirty candidate findings, nineteen of which survived refutation and are all fixed with tests — including three blockers: guarded completion columns open on INSERT, every recurring-occurrence save failing on a null id, and one Delete emptying the grid's tab order |
| 2026-09-07 | 4     | Opus 5 / xhigh   | Task manager built on the multi-block model that already existed: `@momentum/core/tasks` (six views, six sorts, coverage, fractional reordering) run under two process timezones; six views over one server read with the filtering done by the same pure predicates the tests cover; Quick Add mounted in the shell on `Q`; a detail sheet that edits every field on commit, with a 0..n work-block editor and visible coverage; one optimistic overlay for thirteen mutations with no hand-written revert; drag and `Alt+↑/↓` reordering through one `sortOrderForMove`; the three primitives the design system had deferred, plus `CoverageBar`. **The refactor the phase was scoped around was not needed** — `tasks` has never had a scheduling column — so it shipped a guard instead: a test that reads every migration and fails any that adds one, verified by making it fail. 806 unit and component tests green (up from 628) and a clean production build; **not walked in a browser**, because the local Docker daemon did not respond this session |
| 2026-09-07 | 5     | Fable 5.1 / ultracode | Week planning and Find Time built in four parallel lanes over a lead-owned seam (`@momentum/core/scheduling` contracts and interval arithmetic, the extended calendar view models): a pure, deterministic Find Time engine with lexicographic ranking, per-day diversity, overlapping fallback and one-sentence explanations, documented in `docs/SCHEDULING.md`; capacity and the four conflict warnings as pure functions with neutral copy; the Plan My Week drawer beside the calendar deriving every number from the optimistic week, with Find Time and manual scheduling reachable by keyboard; the calendar read extended with disjoint sections, outside-range coverage and weekly goals; settings that persist, with working-hours and focus-window editors. 1191 unit and component tests green (up from 806), 139 of them on the engine including DST and Santiago's midnight gap; cold production build green. **Not walked in a browser**: Docker hung again. HABITS omitted (Phase 6 not shipped) |
| 2026-09-08 | 9     | Opus 5 / high    | Today page built as one server read and one client island: `agenda.ts` (timeline placement, the four Next Up states, risk assembly) pure and unit-tested; a Next Up that always answers, with Start focus as a link, Complete through the server-decided `completesTask`, and Reschedule committing the same wall-clock span a drag does; a timeline distinguishing past, current and future by emphasis, shape and word; unscheduled tasks due today, habits completable in one press, today's quests; and an At Risk section that is not rendered when there is nothing at risk and clears in the same frame as the completion that cleared it. Four mutations over one optimistic overlay with no hand-written revert. Two extractions rather than two copies — `features/calendar/items.ts` and `patchCompletions` — and the last of `lib/placeholder-data.ts` outside analytics deleted. 1930 unit and component tests green (up from 1843), including four new ones on `useMidnightRollover` across both of New York's DST transitions, and the 326 database assertions re-run clean. **Rendered against the live database for both seeded accounts** in their own timezones and the markup read back; **not driven in a real browser** — the extension was not connected |
| 2026-09-08 | 10    | Opus 5 / xhigh   | Analytics built as a separate tested aggregation layer plus a thin render: `@momentum/core/analytics` (period, the three bucketing rules, focus/task/estimate/habit/block aggregations, gated insights, one `summariseAnalytics` front door) with 117 tests under both process timezones — DST-correct window lengths, an hour axis that omits the skipped hour and doubles the repeated one, and week columns that do not shift. Ninety days read once and aggregated into all three windows, so the range control is state rather than a round trip. Six visualizations, each a named `<figure>` whose numbers are a server-rendered `sr-only` table beside an `aria-hidden` chart. Planned-vs-actual sums both sides over the same task set and names what it excludes. Insights gated on declared sample sizes and suppressed below them, with two vocabulary guards against causal claims and judgment. 2155 unit and component tests green (up from 1930); typecheck, lint and a cold production build green. **Rendered against the live database for both seeded accounts and a fresh signup**, with gating visible end to end (7 and 30 days silent, 90 days one earned insight); chart contrast computed from the tokens in both themes (lowest 3.26:1). **Not driven in a real browser** — the extension was not connected |
| 2026-09-08 | 11    | Opus 5 / high    | Command palette, Quick Add parsing and the typed command registry. `@momentum/core/parser` added as a deterministic, clock-free module: metadata is a trailing run, a bare number is never a duration, a weekday is the *next* one, conflicts stop the scan instead of overwriting, and every non-whitespace character of the input is provably still in the title or in a chip — 57 tests under both process timezones. Chips make parsing refusable: removing one, or setting the control it was filling, returns its words to the title, so a field never has two owners. The palette is a list plus a registry — features declare commands in `features/<feature>/commands.ts`, navigation is derived from `lib/nav.ts`, and one deterministic fuzzy scorer ranks commands, tasks and projects together with recency breaking ties. ⌘K/Ctrl+K from every route, focus trapped and restored to the opener, results announced through the app's one live region, and creation commands that own no surface carry an intent the owning page honours once. The search index costs no query — it is narrowed from rows the shell already read. 2341 unit and component tests green (up from 2155); typecheck, lint and a cold production build green. **Rendered against the live database** for the seeded account with the palette's index verified on the wire; **not driven in a real browser** — the extension was not connected |
| 2026-09-08 | 12    | Opus 5 / high    | PWA and installability, and the first phase since 3 to be **driven in a real browser** — Chrome 152 over the DevTools protocol, against production builds, because the extension was not connected. The manifest, six icons generated from one mark, a service worker, a self-contained offline page, an offline strip, safe areas and a theme-color that follows the chosen theme. Four defects, three of them found only by verifying: (1) the auth proxy answered `manifest.webmanifest` and `sw.js` with a 307 to `/login` for the credential-less fetches a browser makes, which alone made the app un-installable; (2) the four `useActionState` auth forms re-throw a rejected action into render, so signing in offline reached `global-error.tsx` — now `app/(auth)/error.tsx`; (3) `registration.update()` can never see a deploy, because `public/sw.js` is byte-identical across builds and a soft navigation fetches an RSC payload rather than a document, so a tab open across a deploy would have run the old bundle indefinitely — closed by `app/version/route.ts` and a poll; (4) the offline notice covered the top bar at 393px, caught in a screenshot, and is now a row in each frame rather than an overlay. Verified in the browser: zero manifest parse errors and an empty `Page.getInstallabilityErrors` (the API behind Lighthouse's installability audit); the worker activating with `momentum-{shell,static}-<build>` and **no HTML in any cache** after a controlled load; a navigation with the network cut serving the designed offline page in both themes; a tab left open while a second build was deployed under it being offered the new version, taking it, and ending with only the new caches; `theme-color` on both meta tags following a chosen dark theme under a light OS; and 59/34px iPhone insets landing as frame padding, `<main>` scroll padding and the offline page's own padding. 2385 unit and component tests green (up from 2341), 44 new, 16 of them evaluating the real `public/sw.js` in a fake `ServiceWorkerGlobalScope`; typecheck, lint and a cold production build green. **Not done**: an install on macOS or iOS Safari, and a Lighthouse run |
| 2026-09-09 | 13    | Fable 5.1 / ultracode | Final product-quality audit. Inspect-then-fix, as the spec demands: five inspection lanes with disjoint ownership walked all 18 workflows in headless Chrome (system Chrome via `playwright-core`; the extension was not connected) as both seed accounts at 1280/375 in both themes, verifying persistence by reload and SQL and forcing every optimistic path to fail; 78 findings (2 P0 · 30 P1 · 46 P2) written into this file before any change. Six fix lanes (five features + the e2e harness) then fixed 76 and recorded 2. P0s: a task dragged from a *scrolled* Plan drawer persisted hours from the pointer (dnd-kit's scroll-adjusted `delta`), and quests could not be claimed at all (`z.uuid()` rejecting md5-derived ids). The P1s were mostly one defect nine times — focus dropped on `<body>` — plus touch targets, unreachable Retry under modals, lost validation messages, no delete confirmation, a four-zone timezone list, week planning missing below `lg`, focus launch ignoring `?task`, a rejected focus/quest call blanking the route, amount habits ticked as 1 unit, a recovery link bound to one browser, inert notification switches. Design audit fixed by removal. `pnpm test:e2e` now exists (18 specs, passed twice in its lane). Gates on the integrated tree: typecheck, lint, `MOMENTUM_DB_TESTS=1 pnpm test` 2861/2861 (the 361 RLS/anti-farm database cases included, fresh seed), `pnpm test:e2e` 18/18, cold build, no secret in the client bundle — the last two suites through a hand-run kong gateway after the CLI's kong container hung the Docker daemon four restarts in a row (known issue). |
