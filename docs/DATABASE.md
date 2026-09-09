# Momentum — Database

**Status: 🟢 SHIPPED (Phase 2, 2026-09-06).** Every table, column, constraint, index,
trigger and policy below exists in `supabase/migrations/`, applied to an empty database and
verified against a running stack: `pnpm db:reset` from scratch, `pnpm db:types` regenerated
and checked in, and `pnpm test:db` green (154 assertions). If this file and the migrations
ever disagree, the migrations are the truth and this file is the bug.

Column-level detail is exhaustive on purpose. Phase 2 implemented the Phase 0 design as
written; where it changed or deferred something, the line says so and gives the reason.

---

## Conventions

- Schema `public`; tables plural, snake_case; `id uuid primary key default gen_random_uuid()`.
- Every instant is `timestamptz` (stored UTC). Every calendar-date concept is `date`.
  Wall-clock times are `time`. Durations are integer minutes (Domain Rule 4).
- `created_at timestamptz not null default now()`; `updated_at` maintained by the
  `set_updated_at()` trigger on every table that has it.
- Every user-owned table has `user_id uuid not null references public.profiles(id) on delete cascade`
  and is RLS-enabled with the four `own` policies unless the table says otherwise.
- Policies use `(select auth.uid())` so the planner evaluates it once.
- Foreign keys that cross tables are re-checked by `assert_same_owner()` triggers so a
  row can never reference another user's row. It is one generic trigger function taking
  `(column, referenced table)` pairs as arguments; every referenced table has a `user_id`
  and every lookup is a primary-key hit. It is `security definer`, so the answer does not
  depend on the caller's own policies — pointing at a row that does not exist and pointing
  at someone else's row are the same refusal, which is also why it leaks nothing.
- Trusted logic is `security definer` SQL with `set search_path = ''`, owned by the
  migration role; it sets `momentum.trusted = on` for the transaction, and `before update`
  triggers reject writes to **guarded columns** when the flag is absent. `public.is_trusted()`
  reads the flag and `public.reject_guarded_write(table, column)` raises the refusal
  (SQLSTATE `42501`), so every guard refuses in the same words.
- Ledgers are append-only: no `update` or `delete` policy, no function deletes.
- Table privileges are stated, not inherited. The last migration revokes everything in
  `public` from `anon` and `authenticated` — including the default privileges that would
  otherwise apply to tables a *future* migration creates — then grants the matrix below one
  table at a time. A table added without a decision therefore has no access at all. `anon`
  reaches nothing: Momentum has no public surface. Definition tables are readable by
  `authenticated` and written only by migrations.
- Function privileges work the same way: `execute` is revoked from `PUBLIC`, so a function
  is not a PostgREST endpoint unless a migration says so. Phase 2 grants exactly three
  (`is_trusted`, `is_valid_timezone`, `reject_guarded_write`) because the guard and
  validation triggers are `security invoker` and call them as the signed-in role.
- Everything ships as a migration. Generated types are checked in at
  `packages/db/src/database.types.ts`.

## Migrations

Applied in filename order; each one is a single concern, so a review reads as the schema
was designed rather than as one wall of SQL.

| Migration                                | Contains                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `20260906120000_enums_and_helpers.sql`   | Every enum; `set_updated_at`, `is_trusted`, `reject_guarded_write`, `is_valid_timezone`, `validate_timezone`, `assert_same_owner` |
| `20260906120100_profiles.sql`            | `profiles`, its guard, and the `handle_new_user()` trigger on `auth.users`       |
| `20260906120200_projects.sql`            | `projects`                                                                      |
| `20260906120300_tasks.sql`               | `tasks`, `enforce_subtask_depth`, `guard_tasks`                                 |
| `20260906120400_habits.sql`              | `habits`                                                                        |
| `20260906120500_calendar_blocks.sql`     | `calendar_blocks`, `validate_recurrence`, `sync_recurrence_until`, `guard_blocks` |
| `20260906120600_habit_completions.sql`   | `habit_completions`                                                             |
| `20260906120700_focus.sql`               | `focus_sessions`, `focus_pauses`                                                |
| `20260906120800_xp_events.sql`           | `xp_events`                                                                     |
| `20260906120900_gamification.sql`        | Achievement, quest and cosmetic tables; `weekly_goals`; `guard_weekly_goals`, `guard_user_cosmetics`, `enforce_one_equipped_per_kind` |
| `20260906121000_weekly_reviews.sql`      | `weekly_reviews`                                                                |
| `20260906121100_definitions.sql`         | The seeded achievement, quest and cosmetic definitions                          |
| `20260906121200_grants.sql`              | The privilege matrix, and the default that new objects get nothing              |
| `20260906130000_calendar_functions.sql`  | _(Phase 3)_ `assert_caller`; `complete_task`, `uncomplete_task`, `complete_block`, `uncomplete_block` |
| `20260906130100_guard_inserts.sql`       | _(Phase 3)_ Guarded columns refused on insert as well as on update              |
| `20260906130200_override_kind.sql`       | _(Phase 3)_ `blocks_override_shape_chk` gains its `kind = 'event'` clause       |
| `20260907120000_habit_functions.sql`     | _(Phase 6)_ `habit_completion_id`; `record_habit_completion`, `remove_habit_completion`, `complete_habit_block`, `uncomplete_habit_block` |
| `20260907130000_focus_functions.sql`     | _(Phase 7)_ `xp_rule`, `xp_rule_unknown`, `focus_session_elapsed_minutes`, `end_focus_session`; `start_focus_session`, `pause_focus_session`, `resume_focus_session`, `mark_interruption`, `finish_focus_session`, `abandon_focus_session` |
| `20260907140000_gamification_functions.sql` | _(Phase 8)_ the XP economy: caps, level curve, awards, quests, achievements, weekly goals, cosmetics |
| `20260909120000_security_default_privileges.sql` | _(Phase 13 audit)_ global `revoke execute on functions from public`; revoke default sequence privileges from `authenticated` |
| `20260909120100_security_xp_caps.sql`    | _(Phase 13 audit)_ `cap_xp_event` / `end_focus_session` use a rolling 24h window (was a client-timezone calendar day) under a per-user row lock |
| `20260909120200_security_weekly_goals.sql` | _(Phase 13 audit)_ `guard_weekly_goals`: current-week-only insert, frozen `week_start`/`metric`/`target`; `weekly_goals_target_cap_chk` |
| `20260909120300_security_quest_multiplication.sql` | _(Phase 13 audit)_ `quest_assignments.timezone`; `assign_quests` skips window-overlapping sets |
| `20260909120400_security_freeze_created_at.sql` | _(Phase 13 audit)_ `freeze_created_at` on every client-writable table |
| `20260909150000_quest_visibility.sql` | _(Phase 13 fix pass)_ `ensure_quest_assignments` returns every assignment whose window, in the zone it was assigned in, contains `now()` |

---

## Enums

| Enum               | Values                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `task_status`      | `open` · `completed` · `archived`                                                           |
| `block_kind`       | `event` · `work` · `habit`                                                                  |
| `habit_frequency`  | `daily` · `weekdays` · `times_per_week` · `amount_per_day` · `amount_per_week`              |
| `habit_unit`       | `count` · `minutes`                                                                         |
| `focus_status`     | `running` · `paused` · `completed` · `abandoned`                                            |
| `xp_source`        | `task` · `focus_session` · `habit_completion` · `quest` · `weekly_goal` · `achievement`     |
| `quest_period`     | `daily` · `weekly`                                                                          |
| `quest_metric`     | `tasks_completed` · `priority_tasks_completed` · `focus_minutes` · `habits_completed` · `habit_days` · `blocks_completed` |
| `cosmetic_kind`    | `profile_frame` · `theme` · `block_style` · `avatar`                                        |
| `project_color`    | `slate` · `red` · `orange` · `amber` · `green` · `teal` · `cyan` · `blue` · `indigo` · `violet` · `pink` · `rose` |

Each enum has a matching `as const` array in `@momentum/core/types`; a compile-time test in
`@momentum/db` asserts they are equal.

---

## Relationship map

```
auth.users 1──1 profiles
                 │
   ┌─────────────┼────────────────┬──────────────────┬───────────────┬─────────────────┐
   │             │                │                  │               │                 │
projects 1──* tasks 1──* calendar_blocks *──1 habits 1──* habit_completions      focus_sessions 1──* focus_pauses
   │             │   (kind=work)      (kind=habit)        (source_block_id → blocks)      │
   └────────* focus_sessions ──────────────────────────────────────────────────────────────┘
             (project_id, task_id nullable)

profiles 1──* xp_events                 (append-only ledger; unique per source)
profiles 1──* user_achievements *──1 achievement_definitions
profiles 1──* quest_assignments  *──1 quest_definitions
profiles 1──* weekly_goals
profiles 1──* user_cosmetics     *──1 cosmetic_definitions
profiles 1──* weekly_reviews
calendar_blocks (series) 1──* calendar_blocks (overrides via series_id)
tasks (parent) 1──* tasks (subtasks via parent_task_id, depth 1)
```

---

## Tables

### profiles

One row per auth user, created by the `handle_new_user()` trigger on `auth.users`.

| Column          | Type          | Constraints / default                                             |
| --------------- | ------------- | ----------------------------------------------------------------- |
| `id`            | `uuid`        | PK, `references auth.users(id) on delete cascade`                 |
| `display_name`  | `text`        | not null, default `''`, `length <= 80`                            |
| `timezone`      | `text`        | not null, default `'UTC'`; validated by trigger `validate_timezone()`, which calls `is_valid_timezone()` — the name must exist in `pg_timezone_names`. **(Phase 2)** The designed test was `now() at time zone new.timezone`, which also accepts POSIX offset strings such as `UTC+5`; a lookup against the tz database is the check the product actually means. |
| `week_start`    | `smallint`    | not null, default `1`, `check (week_start between 0 and 6)`       |
| `working_hours` | `jsonb`       | not null, default Mon–Fri `[{"start":"09:00","end":"17:00"}]`, `check (jsonb_typeof(working_hours) = 'object')`; shape validated by zod at the app boundary |
| `focus_windows` | `jsonb`       | not null, default `'[]'`, `check (jsonb_typeof(focus_windows) = 'array')` |
| `snap_minutes`  | `smallint`    | not null, default `15`, `check (snap_minutes in (5, 10, 15, 30))`  |
| `level`         | `integer`     | not null, default `1`, `check (level >= 1)` — **guarded**          |
| `xp`            | `integer`     | not null, default `0`, `check (xp >= 0)` — **guarded**             |
| `coins`         | `integer`     | not null, default `0`, `check (coins >= 0)` — **guarded**          |
| `created_at`    | `timestamptz` | not null, default `now()`                                          |
| `updated_at`    | `timestamptz` | not null, default `now()`, trigger                                 |

Timezone at signup: the signup form sends the browser timezone in `raw_user_meta_data`;
`handle_new_user()` copies it when valid, otherwise `'UTC'`; the app then shows the
mismatch banner (`docs/ARCHITECTURE.md` §10).

RLS: `select` own · `update` own (guarded columns enforced by trigger) · no `insert`
(trigger) · no `delete` (cascade from `auth.users`).

### projects

| Column        | Type            | Constraints / default                                   |
| ------------- | --------------- | ------------------------------------------------------- |
| `id`          | `uuid`          | PK                                                      |
| `user_id`     | `uuid`          | not null, FK profiles cascade                           |
| `name`        | `text`          | not null, `check (length(name) between 1 and 100)`      |
| `description` | `text`          | null                                                    |
| `color`       | `project_color` | not null, default `'blue'`                              |
| `icon`        | `text`          | null (icon key)                                         |
| `archived_at` | `timestamptz`   | null                                                    |
| `created_at`  | `timestamptz`   | not null, default `now()`                               |
| `updated_at`  | `timestamptz`   | not null, default `now()`, trigger                      |

Indexes: `projects_user_idx (user_id, archived_at)` — sidebar list, active first.
FKs: deleting a project sets `tasks.project_id` and `focus_sessions.project_id` to null
(the work survives; it returns to the inbox). Archiving is the normal path.
RLS: full `own` set.

### tasks

**No scheduling columns.** When a task is worked on is expressed by its work blocks
(`calendar_blocks.kind = 'work'`, 0..n per task). Adding `scheduled_start`/`scheduled_end`
here is a Domain Rule 2 violation, not a shortcut.

| Column              | Type          | Constraints / default                                                   |
| ------------------- | ------------- | ----------------------------------------------------------------------- |
| `id`                | `uuid`        | PK                                                                      |
| `user_id`           | `uuid`        | not null, FK profiles cascade                                           |
| `project_id`        | `uuid`        | null, `references projects(id) on delete set null`                      |
| `parent_task_id`    | `uuid`        | null, `references tasks(id) on delete cascade`; depth 1 enforced by trigger `enforce_subtask_depth()` (parent must itself have no parent; subtask inherits `project_id`) |
| `title`             | `text`        | not null, `check (length(title) between 1 and 500)`                     |
| `description`       | `text`        | null                                                                    |
| `status`            | `task_status` | not null, default `'open'` — **guarded**                                |
| `priority`          | `smallint`    | not null, default `4`, `check (priority between 1 and 4)`               |
| `estimated_minutes` | `integer`     | null, `check (estimated_minutes > 0 and estimated_minutes <= 10080)`    |
| `actual_minutes`    | `integer`     | not null, default `0`, `check (actual_minutes >= 0)` — **guarded**      |
| `due_date`          | `date`        | null (user-local calendar date)                                         |
| `completed_at`      | `timestamptz` | null — **guarded**                                                      |
| `archived_at`       | `timestamptz` | null                                                                    |
| `sort_order`        | `double precision` | not null, default `0` (midpoint inserts; `renormalize_sort_order()` when gaps get tiny) |
| `created_at`        | `timestamptz` | not null, default `now()`                                               |
| `updated_at`        | `timestamptz` | not null, default `now()`, trigger                                      |

Checks: `tasks_status_completed_chk`: `(status = 'completed') = (completed_at is not null)`;
`tasks_status_archived_chk`: `status <> 'archived' or archived_at is not null`;
`tasks_no_self_parent_chk`: `parent_task_id is distinct from id`;
`tasks_title_chk`, `tasks_priority_chk`, `tasks_estimate_chk`, `tasks_actual_chk` as above.

Triggers fire in name order, which is the order they need: `tasks_enforce_subtask_depth`
rewrites `project_id` from the parent, then `tasks_same_owner` validates the result, then
`tasks_guard` and `tasks_set_updated_at` run on updates.

Indexes: `tasks_user_status_due_idx (user_id, status, due_date)` — Today / Upcoming /
Completed views, At Risk, and _(Phase 5)_ `tasks.listOverdue` (`status = 'open'`, `archived_at is null`,
`parent_task_id is null`, `due_date < today`); `tasks_user_project_idx (user_id, project_id, sort_order)` —
per-project view and reorder; `tasks_parent_idx (parent_task_id)` — subtasks.

RLS: `select`, `insert`, `delete` own; `update` own with guarded columns (`status`,
`completed_at`, `actual_minutes`) writable only by `complete_task()`,
`uncomplete_task()`, `finish_focus_session()`. Archiving is a plain client update of
`archived_at` together with `status = 'archived'`, allowed by the guard because the
transition is not to or from `completed` (`guard_tasks()` permits `open ↔ archived`).

### calendar_blocks

Every time-bound row on the board. **Decision:** one table with a `kind` discriminator
rather than separate `work_blocks` / `habit_blocks` tables or table inheritance.

_Rationale._ The product's one mechanic is that everything competes for the same week, so
every consumer — the week grid, overlap detection, capacity math, Find Time, Today's
timeline, analytics — wants **one range query** over all blocks, one index, one drag
mutation, and one RLS policy. Multi-block-per-task is satisfied by the FK living on the
block (`task_id`, N blocks → 1 task). Per-kind integrity that separate tables would give
for free is recovered with check constraints below, which are precise and cheap.

_Rejected._ Separate tables per kind (every read becomes a three-way union or a view;
move/resize/complete fork by table; overlap and capacity math must union). Class-table
inheritance (`blocks` + `work_blocks` 1:1): same integrity as the checks, but every insert
is two statements through PostgREST and every read a join.

| Column             | Type            | Constraints / default                                                      |
| ------------------ | --------------- | -------------------------------------------------------------------------- |
| `id`               | `uuid`          | PK                                                                         |
| `user_id`          | `uuid`          | not null, FK profiles cascade                                              |
| `kind`             | `block_kind`    | not null                                                                   |
| `task_id`          | `uuid`          | null, `references tasks(id) on delete cascade`                             |
| `habit_id`         | `uuid`          | null, `references habits(id) on delete cascade`                            |
| `title`            | `text`          | not null, default `''`; events carry their own title, work/habit blocks display the task/habit title |
| `description`      | `text`          | null                                                                       |
| `start_at`         | `timestamptz`   | not null                                                                   |
| `end_at`           | `timestamptz`   | not null                                                                   |
| `all_day`          | `boolean`       | not null, default `false`                                                  |
| `color`            | `project_color` | null (inherit from project / kind)                                         |
| `completed_at`     | `timestamptz`   | null — **guarded** (`complete_block()`)                                    |
| `recurrence`       | `jsonb`         | null; `{freq, interval, byWeekday, until, count, timezone}` on series rows |
| `recurrence_until` | `date`          | null; mirror of `recurrence->>'until'` for indexing, maintained by trigger  |
| `series_id`        | `uuid`          | null, `references calendar_blocks(id) on delete cascade` (override → series) |
| `occurrence_date`  | `date`          | null; which occurrence an override replaces (in the series timezone)       |
| `cancelled`        | `boolean`       | not null, default `false`                                                  |
| `created_at`       | `timestamptz`   | not null, default `now()`                                                  |
| `updated_at`       | `timestamptz`   | not null, default `now()`, trigger                                         |

Checks:

- `blocks_span_chk`: `end_at > start_at and end_at - start_at <= interval '7 days'`
- `blocks_kind_shape_chk`:
  `(kind = 'work' and task_id is not null and habit_id is null) or (kind = 'habit' and habit_id is not null and task_id is null) or (kind = 'event' and task_id is null and habit_id is null)`
- `blocks_event_title_chk`: `kind <> 'event' or length(title) > 0`
- `blocks_recurrence_kind_chk`: `recurrence is null or (kind = 'event' and series_id is null)`
- `blocks_override_shape_chk`: `(series_id is null) = (occurrence_date is null) and (series_id is null or kind = 'event')`
  _(the `kind` clause added by `20260906130200_override_kind.sql`; only events recur, Domain Rule 16, so only an event row may be an override)_
- `blocks_cancelled_chk`: `cancelled = false or series_id is not null`
- `blocks_until_chk`: `recurrence is not null or recurrence_until is null`
- `blocks_no_self_series_chk`: `series_id is distinct from id`
- `recurrence` shape validated by `validate_recurrence()` trigger (freq ∈ enum, interval ≥ 1,
  byWeekday ⊆ 0..6, valid timezone, not both `until` and `count`).

Indexes: `blocks_user_start_idx (user_id, start_at)` — the week/day window query
(`start_at < :end and end_at > :start`) and Today; `blocks_series_idx (user_id, recurrence_until) where recurrence is not null`
— series candidates for a window; `blocks_override_uniq unique (series_id, occurrence_date) where series_id is not null`
— one override per occurrence; `blocks_task_idx (task_id)` — coverage math, Plan panel
"has no blocks"; `blocks_habit_idx (habit_id)` — habit week generation.

Triggers: `assert_same_owner()` (task/habit/series belong to `user_id`);
`sync_recurrence_until()`; `validate_recurrence()`; `guard_blocks()` (`completed_at`).
`sync_recurrence_until()` runs before `validate_recurrence()` (name order) and is
deliberately tolerant of a malformed `until`, so the error the user sees is the one that
names the field.

RLS: `select`, `insert`, `update`, `delete` own; `completed_at` only via `complete_block()` /
`uncomplete_block()`.

### habits

| Column                 | Type              | Constraints / default                                                  |
| ---------------------- | ----------------- | ---------------------------------------------------------------------- |
| `id`                   | `uuid`            | PK                                                                     |
| `user_id`              | `uuid`            | not null, FK profiles cascade                                          |
| `name`                 | `text`            | not null, `check (length(name) between 1 and 100)`                     |
| `description`          | `text`            | null                                                                   |
| `frequency_type`       | `habit_frequency` | not null                                                               |
| `target`               | `integer`         | not null, default `1`, `check (target > 0)`                            |
| `unit`                 | `habit_unit`      | not null, default `'count'`                                            |
| `active_days`          | `smallint[]`      | not null, default `'{}'`; `check (active_days <@ array[0,1,2,3,4,5,6]::smallint[])` |
| `preferred_start_time` | `time`            | null                                                                   |
| `estimated_minutes`    | `integer`         | null, `check (estimated_minutes > 0 and estimated_minutes <= 720)`     |
| `xp_reward`            | `integer`         | not null, default `5`, `check (xp_reward between 0 and 50)` (anti-farm cap) |
| `color`                | `project_color`   | null                                                                   |
| `archived_at`          | `timestamptz`     | null (archiving preserves history)                                     |
| `created_at`           | `timestamptz`     | not null, default `now()`                                              |
| `updated_at`           | `timestamptz`     | not null, default `now()`, trigger                                     |

Checks: `habits_weekdays_chk`: `frequency_type <> 'weekdays' or cardinality(active_days) > 0`;
`habits_unit_chk`: `frequency_type in ('amount_per_day', 'amount_per_week') or unit = 'count'`;
`habits_target_chk`: `frequency_type not in ('daily', 'weekdays') or target = 1`.

Indexes: `habits_user_idx (user_id, archived_at)`. RLS: full `own` set.

### habit_completions

Exactly one row per habit per user-local date (Domain Rule 14).

| Column            | Type          | Constraints / default                                              |
| ----------------- | ------------- | ------------------------------------------------------------------ |
| `id`              | `uuid`        | PK                                                                 |
| `habit_id`        | `uuid`        | not null, `references habits(id) on delete cascade`                |
| `user_id`         | `uuid`        | not null, FK profiles cascade                                      |
| `completion_date` | `date`        | not null; computed by the function in the profile timezone         |
| `amount`          | `integer`     | not null, default `1`, `check (amount > 0)`                        |
| `source_block_id` | `uuid`        | null, `references calendar_blocks(id) on delete set null`          |
| `completed_at`    | `timestamptz` | not null, default `now()`                                          |

Indexes: `habit_completions_uniq unique (habit_id, completion_date)`;
`habit_completions_user_date_idx (user_id, completion_date)` — week heatmap, Today,
consistency math.

RLS: `select` own only. Writes via `record_habit_completion()` (upsert; awards XP once per
row) and `remove_habit_completion()` (delete; XP stays, Domain Rule 7), shipped by
`20260907120000_habit_functions.sql`.

`id` is not a random uuid: it is `habit_completion_id(habit_id, completion_date)`, the row's
own natural key hashed into one. `habit_completions_uniq` already declares that pair to be
the row's identity, and making the primary key agree with it is what lets the XP ledger
point at the completion by id and still be idempotent across a removal and a re-record
(Domain Rule 6). The seed uses the same helper, so a seeded day cannot earn a second award
the first time the app re-records it.

### focus_sessions

Timer truth. Every timestamp is stamped by the database.

| Column               | Type           | Constraints / default                                                |
| -------------------- | -------------- | -------------------------------------------------------------------- |
| `id`                 | `uuid`         | PK                                                                   |
| `user_id`            | `uuid`         | not null, FK profiles cascade                                        |
| `task_id`            | `uuid`         | null, `references tasks(id) on delete set null`                      |
| `project_id`         | `uuid`         | null, `references projects(id) on delete set null`                   |
| `planned_minutes`    | `integer`      | not null, `check (planned_minutes between 1 and 240)`                |
| `actual_minutes`     | `integer`      | null, `check (actual_minutes >= 0)`; set on finish, excludes pauses  |
| `started_at`         | `timestamptz`  | not null, default `now()`                                            |
| `ended_at`           | `timestamptz`  | null                                                                 |
| `status`             | `focus_status` | not null, default `'running'`                                        |
| `interruption_count` | `integer`      | not null, default `0`, `check (interruption_count >= 0)`             |
| `created_at`         | `timestamptz`  | not null, default `now()`                                            |

Checks: `focus_ended_chk`: `(status in ('completed', 'abandoned')) = (ended_at is not null)`;
`focus_actual_chk`: `status <> 'completed' or actual_minutes is not null`;
`focus_order_chk`: `ended_at is null or ended_at >= started_at`.

Indexes: `focus_sessions_active_uniq unique (user_id) where status in ('running', 'paused')`
— at most one live session, so concurrent sessions cannot double-count;
`focus_sessions_user_started_idx (user_id, started_at desc)` — history, analytics.

RLS: `select` own only. Lifecycle via `start_focus_session()`, `pause_focus_session()`,
`resume_focus_session()`, `mark_interruption()`, `finish_focus_session()`,
`abandon_focus_session()`.

### focus_pauses

| Column       | Type          | Constraints / default                                            |
| ------------ | ------------- | ---------------------------------------------------------------- |
| `id`         | `uuid`        | PK                                                               |
| `session_id` | `uuid`        | not null, `references focus_sessions(id) on delete cascade`      |
| `user_id`    | `uuid`        | not null, FK profiles cascade (denormalized for RLS)             |
| `paused_at`  | `timestamptz` | not null, default `now()`                                        |
| `resumed_at` | `timestamptz` | null, `check (resumed_at > paused_at)`                           |

Indexes: `focus_pauses_open_uniq unique (session_id) where resumed_at is null`;
`focus_pauses_session_idx (session_id)`. RLS: `select` own only.

### xp_events

Append-only ledger (Domain Rule 6, 7, 15).

| Column        | Type          | Constraints / default                                     |
| ------------- | ------------- | --------------------------------------------------------- |
| `id`          | `uuid`        | PK                                                        |
| `user_id`     | `uuid`        | not null, FK profiles cascade                             |
| `source_type` | `xp_source`   | not null                                                  |
| `source_id`   | `uuid`        | null (no FK: the ledger outlives its sources)             |
| `amount`      | `integer`     | not null, `check (amount > 0)`                            |
| `reason`      | `text`        | not null (human-readable, e.g. `Completed "History essay"`) |
| `created_at`  | `timestamptz` | not null, default `now()`                                 |

Indexes: `xp_events_source_uniq unique (user_id, source_type, source_id) where source_id is not null`
— the idempotency guarantee; `xp_events_user_created_idx (user_id, created_at)` — daily
caps, history, reconciliation.

Two triggers, both shipped in Phase 8 (`20260907140000_gamification_functions.sql`):

- `cap_xp_event()` **before** insert applies the per-source daily cap
  (`xp_daily_cap()`), measured in the user's own day over this table rather than over a
  counter that could drift from it. An award trimmed to nothing is dropped rather than
  written as a zero, because `xp_events_amount_chk` says a ledger row is worth something.
  Putting the cap here rather than in each awarding function is what makes it impossible
  for a source added by a later phase to be uncapped by accident (Domain Rule 6).
- `apply_xp_event()` **after** insert: `profiles.xp += amount`,
  `profiles.level = level_for_xp(xp)`. It is the only statement in the product that moves
  either column, which is what makes "the profile total reconciles with the ledger" a
  statement about one table rather than an agreement between two.

**(Phase 2)** The table, its indexes and its policy shipped first; the triggers arrived
with `level_for_xp()` in Phase 8, because a total is only as meaningful as the curve that
reads it. Nothing could insert into the ledger before then — no insert policy and no
grant — so the two never fell out of step.
RLS: `select` own only.

### achievement_definitions · user_achievements

`achievement_definitions`: `id uuid PK`, `key text unique not null`, `name text not null`,
`description text not null`, `sort_order integer not null default 0`. Seeded by migration
with the six starters (`first_step`, `deep_work`, `consistency`, `early_bird`, `planner`,
`project_finisher`). Phase 8 rewrote four of the descriptions: Phase 2 wrote them before
anything evaluated them, and the conditions `achievement_earned()` checks are the ones
specs/08-gamification.md names. The text a user reads and the check behind it are kept in
agreement deliberately — a description that disagrees with its condition is a promise the
product breaks. RLS: `select` for `authenticated`; no writes.

`user_achievements`: `user_id` FK profiles cascade, `achievement_id` FK definitions
cascade, `unlocked_at timestamptz not null default now()`, **PK `(user_id, achievement_id)`**
— an achievement unlocks once. RLS: `select` own. Written by `evaluate_achievements()`.

### quest_definitions · quest_assignments

`quest_definitions`: `id`, `key text unique`, `period quest_period`, `metric quest_metric`,
`target integer check (target > 0)`, `xp_reward integer check (xp_reward between 0 and 100)`,
`coin_reward integer check (coin_reward between 0 and 50)`, `title text`, `description text`,
`active boolean default true`. Volume caps as a check, so no quest can encourage unhealthy
work (Domain Rule 7): daily `focus_minutes <= 120`, `tasks_completed <= 5`; weekly
`focus_minutes <= 360`, `tasks_completed <= 25`, `habit_days <= 7`. Seeded by migration.
RLS: `select` for `authenticated`.

`quest_assignments`: `id`, `user_id`, `quest_id` FK definitions cascade, `period quest_period`,
`period_start date` (the local date, or the week-start date), `slot smallint check (slot >= 0)`,
`completed_at timestamptz null`, `created_at`. Unique `(user_id, period, period_start, slot)`
and `(user_id, quest_id, period_start)`. RLS: `select` own. Written by
`ensure_quest_assignments()` and `claim_quest()` (recomputes progress from source tables in
the user's timezone, then sets `completed_at`, awards XP and coins once via the ledger).

**(Phase 8, revising this document)** The selection rule sketched here was "order active
definitions by `md5(user_id || period_start || key)`". It is a **rotation** instead:
`index = (days since 1970 + a per-account offset) mod n`, then the next 3 (daily) or 2
(weekly) definitions in key order, wrapping. The reason is that
`@momentum/core/gamification` owns quest selection for display
(`docs/ARCHITECTURE.md` §2) and specs/08 requires a unit test of the determinism, so the
rule has to be expressible in TypeScript that runs in a browser — which an md5 ordering is
not, without shipping a hash implementation to it. The rotation is four lines in both
languages, equally deterministic per (account, date), and moves the set day to day rather
than pinning one account to one ordering for ever. The account offset is the last four hex
digits of the user's uuid: a spread, not a secret.

`ensure_quest_assignments()` **takes no arguments**. It resolves today and the week's first
day from the profile's own timezone and week-start preference, so no caller can ask for a
future day's quests or generate a hundred past days of them. The assignment's `id` is
`quest_assignment_id(user, quest, period_start)` — a function of the fact rather than of the
attempt that wrote it, the same reasoning as `habit_completion_id`, so the XP award behind
it stays idempotent even if a row were ever removed.

The return set follows the same rule the anti-multiplication guard applies
(`20260909150000_quest_visibility.sql`): every assignment of the caller whose window —
`[period_start 00:00, +1 day)` for daily, `[period_start 00:00, +7 days)` for weekly, evaluated
in `coalesce(quest_assignments.timezone, profile timezone)` — contains `now()`. Today and the
week's first day are still resolved from the profile for the two `assign_quests` calls; only the
returned rows changed, so a timezone change that moves the local date keeps the held set visible
instead of returning nothing until the next period.

**Export.** `GET /api/export` reads every user-owned table through the session's client with
`select("*")`, so row-level security is the only scoping. Any new user-owned table must be added
to `exportTablesFor` in `apps/web/src/features/export/queries.ts`. Repository writes added by the
fix pass: `projects.insert` (client id), `projects.update` (name, color), `projects.setArchived`
(`archived_at` only — tasks keep `project_id`), `projects.findById`; `tasks.listArchivedFor`
(`archived_at is not null`, newest first). `projects.listFor` still returns archived rows so blocks
keep their colour; list surfaces filter on `archivedAt`.

Phase 8 also strengthened `quest_definitions_volume_chk`: Phase 2 bounded five of the twelve
`(period, metric)` pairs and ended in `else true`, which left a weekly `blocks_completed`
quest for 400 blocks representable. All twelve are now named and the fallback is `false`, so
a metric added to the enum without a decision about how much of it is too much cannot be
seeded at all (Domain Rule 7).

Progress is never stored; it is computed from `tasks`, `calendar_blocks`,
`focus_sessions`, and `habit_completions` for the period, in SQL (`quest_progress()`) for
claiming and in `@momentum/core/gamification` for display.

### weekly_goals

`id`, `user_id`, `week_start date`, `metric quest_metric`, `target integer check (target > 0)`,
`title text null`, `completed_at timestamptz null` (**guarded**, `claim_weekly_goal()`),
`created_at`, `updated_at`. Unique `(user_id, week_start, metric)`. RLS: full `own` set
except the guarded column.

### cosmetic_definitions · user_cosmetics (Phase 8)

`cosmetic_definitions`: `id`, `key text unique`, `kind cosmetic_kind`, `name`, `description`,
`price integer check (price >= 0)`, `sort_order`, `available boolean not null default true`
**(Phase 8)**. RLS: `select` for `authenticated`.

`available` says whether the shop may sell it. Phase 8 implements one collection — profile
frames — as specs/08 asks, and sets `available = (kind = 'profile_frame')`. The other three
kinds keep their definition rows so the architecture is exercised end to end, and
`purchase_cosmetic()` refuses them: a shop that took coins for something the product does
not draw would be the worst possible version of this feature.

`user_cosmetics`: `user_id`, `cosmetic_id`, `purchased_at timestamptz default now()`,
`equipped boolean default false`; PK `(user_id, cosmetic_id)`. Trigger
`enforce_one_equipped_per_kind()` un-equips the other cosmetic of that kind in the same
statement, so the client cannot leave two equipped by failing between two requests. RLS:
`select` own; `update` own, with `guard_user_cosmetics()` rejecting any change to
`user_id`, `cosmetic_id` or `purchased_at` — `equipped` is the only column a client may
move. Insert via `purchase_cosmetic()`, which checks and debits `coins` atomically.

### weekly_reviews (Phase 14)

`id`, `user_id`, `week_start date`, `went_well text`, `got_in_the_way text`,
`change_next_week text`, `completed_at timestamptz`, `created_at`, `updated_at`. Unique
`(user_id, week_start)`. RLS: full `own` set. Numbers shown in a review are derived from
Phase 10 aggregations, never stored here.

---

## Functions (trusted logic)

All `security definer`, `set search_path = ''`, first line `perform public.assert_caller(p_user_id)`
where applicable (caller must be `auth.uid()`), and `perform set_config('momentum.trusted', 'on', true)`.
Each returns the affected row(s) so a server action can hand the result straight to the UI.

**What Phase 2 shipped.** The whole *schema* — every table, constraint, index, policy and
grant — plus `handle_new_user()` and the housekeeping and integrity triggers, which are
part of a table's definition rather than product behaviour. The business-logic functions
below arrive with the phase that owns the feature they serve, which is why the guarded
columns are currently writable by nothing at all: the guards are in place, and the
sanctioned path through them is added when there is a feature to sanction. Each is marked
with its phase.

`xp_rule()`, `level_for_xp()` and the `apply_xp_event()` trigger were deferred with the
functions that use them, because the level curve was the gamification phase's to finalise
and inventing it here would have been guessing. All three shipped in Phase 8
(`20260907140000_gamification_functions.sql`), which also replaced `xp_rule()` with the
full set of tunables and `complete_task()` with a body that awards. `assert_caller()`
arrived with the first of those
functions, in Phase 3 (`20260906130000_calendar_functions.sql`); it is not granted to
`authenticated`, because the `security definer` bodies that call it run as the migration's
owner and publishing it would add an endpoint no caller has a use for.

| Function                                                     | Does                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Phase 2** `handle_new_user()` (trigger on `auth.users`)    | Inserts `profiles` with the timezone from `raw_user_meta_data` (kept only when valid, otherwise `UTC`) and a display name from the metadata or the email's local part. `on conflict do nothing`, so it is safe under retry. |
| **Phase 2** `set_updated_at()`, `is_trusted()`, `reject_guarded_write()`, `is_valid_timezone()`, `validate_timezone()`, `validate_recurrence()`, `sync_recurrence_until()`, `assert_same_owner()`, `enforce_subtask_depth()`, `enforce_one_equipped_per_kind()`, `guard_profiles()`, `guard_tasks()`, `guard_blocks()`, `guard_weekly_goals()`, `guard_user_cosmetics()` | Housekeeping and integrity triggers described above. |
| **Phase 3 / 4 / 8** `complete_task(p_task_id)`                           | `status = completed`, `completed_at = now()`, then one `xp_events` row through `award_xp()`: `task_base` 10, `+ priority_bonus_p1` for a P1, `+ task_significant_bonus` for a task in a project the user estimated at `task_significant_minutes` or more. **Shipped in full** (Phase 3 shipped the transition; Phase 8 replaced the body to add the award, and — as that migration predicted — changed no caller). Idempotent, and does not restamp; the award is keyed on the task's own id, so complete → uncomplete → recomplete collides with the first award on `xp_events_source_uniq` and mints nothing. Never touches the task's blocks. |
| **Phase 3 / 4** `uncomplete_task(p_task_id)`                             | `status = open`, `completed_at = null`. Idempotent. XP stays (append-only ledger, Domain Rule 7).         |
| **Phase 3** `complete_block(p_block_id, p_also_complete_task boolean default false)` | Sets `completed_at = now()` and nothing else (Domain Rule 13); when the flag is true — the UI's decision, resolved server-side from the task's other blocks — also calls `complete_task`, outside the "already complete" branch so a retry that lost its response still finishes the job. Raises `22023` if the block has no task. Idempotent, and does not restamp. Counts toward `blocks_completed`. |
| **Phase 3** `uncomplete_block(p_block_id, p_also_uncomplete_task boolean default false)` | Clears `completed_at`. Reopens the task only when the flag is true — the mirror of `complete_block`'s flag, so a completion the user made in one action can be undone in one action; the caller decides, and the control's label and its effect are chosen in the same place. Raises `22023` if the block has no task. Idempotent. |
| **Phase 6** `record_habit_completion(habit_id, on_date date, amount, source_block_id)` | Upserts the `(habit_id, on_date)` row (adds `amount` for amount habits; no-op for boolean habits); inserts `xp_events (habit_completion, row id, habit.xp_reward)` once. `on_date` must be within ±1 day of today in the profile timezone. **Shipped** (`20260907120000_habit_functions.sql`); unchanged by Phase 8, which moved the total through the ledger's own triggers rather than by rewriting a working body. `habit_daily_cap` bounds what one day of habit completions can mint. |
| **Phase 6** `remove_habit_completion(habit_id, on_date)`                 | Deletes the row and returns it, or null if there was none. XP stays. **Shipped.**                        |
| **Phase 6** `habit_completion_id(habit_id, on_date date)`                | A completion's primary key, derived from its natural key `(habit_id, completion_date)` — the same pair `habit_completions_uniq` already calls the row's identity. This is what makes the XP award idempotent across a removal and a re-record (Domain Rule 6): the id is a function of the fact, not of the attempt that wrote it. Internal; not granted. `supabase/seed.sql` uses it too, so a seeded day cannot earn a second award. |
| **Phase 6** `complete_habit_block(block_id)` / `uncomplete_habit_block(block_id)` | The two facts of completing a habit block, in one transaction: `completed_at` on the block (Domain Rule 13) and the completion row for the block's own local date (Domain Rule 14). The amount is the block's length for a habit measured in minutes, one otherwise. Raises `22023` for a block that is not a habit block. Un-completing removes only the completion *that block* created — a day recorded from the habits page survives, because "this span was not executed" is not the statement "the habit did not happen". Idempotent both ways. |
| **Phase 7** `start_focus_session(planned_minutes, id, task_id, project_id)` | Fails with `conflict` (`23505`) if a live session exists; inserts with `started_at = now()`. **Shipped** (`20260907130000_focus_functions.sql`). `id` is client-generated and optional (Domain Rule 17): a call naming a session that already exists returns it, so a retry after a lost response rejoins the session it created instead of colliding with it. The project is inherited from the task when it is not named. |
| **Phase 7** `pause_focus_session(id)` / `resume_focus_session(id)`       | Inserts / closes a `focus_pauses` row with `now()`; flips `status`. **Shipped.** Both are no-ops in the state they would produce, so a double-press or a retry settles rather than raising. |
| **Phase 7** `mark_interruption(id)`                                      | `interruption_count += 1`. **Shipped.** Only ever called because the user said so; nothing is inferred and nothing is deducted (Domain Rule 7). |
| **Phase 7** `finish_focus_session(id)`                                   | `actual_minutes = floor((now() - started_at - sum(pauses)) / 1 min)`, `status = completed`, `ended_at = now()`; `tasks.actual_minutes += actual_minutes`; awards focus XP per `xp_rule()` (1/min, ≥ `min_session_minutes` else 0, +10% when `actual >= planned`, priority bonus, then `session_cap`, then what is left of `daily_cap` computed over `xp_events` in the profile's local day). **Shipped**, as a thin wrapper over the internal `end_focus_session(id, status)`. Idempotent: a session that has already ended returns unchanged before any clock is read or any row is written, so the minutes reach the task once and the ledger row is minted once (Domain Rules 6, 17); `xp_events_source_uniq` is the second line of defence behind that. `evaluate_achievements()` remains Phase 8's, exactly as it is for `complete_task`. |
| **Phase 7** `abandon_focus_session(id)`                                  | `status = abandoned`, `ended_at = now()`, `actual_minutes` recorded on the session **and added to the linked task**, no XP. **Shipped.** _(Phase 7 decided the half this row left open: the minutes reach the task. Work done is work done — twenty-five minutes are twenty-five minutes whether or not the bell rang — and Domain Rule 3 calls that number the product's most valuable long-term signal, so dropping it would make every estimate-versus-actual comparison quietly under-report. The XP is what distinguishes the two endings, because XP is the reward and the minutes are the measurement; nothing already earned is withdrawn (Domain Rule 7).)_ |
| **Phase 8** `ensure_quest_assignments()`                                 | Assigns today's and this week's quests, and returns every assignment whose window (in the zone it was assigned in) contains now. **Shipped** (`20260907140000_gamification_functions.sql`, amended by `20260909150000_quest_visibility.sql`). Takes no arguments: the period is resolved from the profile's timezone and week-start preference, so no caller can choose it. Deterministic per (account, date) — see the rotation above — and `on conflict do nothing`, so calling it on every page load is free. |
| **Phase 8** `quest_progress(assignment_id)` · `weekly_goal_progress(goal_id)` · `metric_progress(user, metric, from, to)` | Recompute a metric over a window of local dates in the profile timezone. **Shipped.** `metric_progress` is the one implementation both wrappers call; progress is never stored, so un-completing something lowers the count instead of leaving a stale total. `focus_minutes` counts every measured minute an ended session recorded, an abandoned one included (Domain Rules 3, 7). |
| **Phase 8** `claim_quest(assignment_id)`                                 | Verifies `progress >= target` from the source rows, sets `completed_at`, awards XP and coins once. **Shipped.** Idempotent twice over: an already-claimed assignment returns before anything is written, and the coin credit is gated on the ledger accepting the XP row. |
| **Phase 8** `claim_weekly_goal(goal_id)`                                 | Same pattern, with one difference that matters: the award's `source_id` is `weekly_goal_award_id(user, week_start, metric)`, not the goal's row id. `weekly_goals` is fully client-writable, so an id-keyed award would be mintable again by deleting the goal and creating it. The key is the goal's natural one — the same reasoning as `habit_completion_id`. The reward is flat (`weekly_goal_base`, `weekly_goal_coins`), so a bigger target buys nothing. **Shipped.** |
| **Phase 8** `purchase_cosmetic(cosmetic_id)`                             | Checks `available`, checks `coins >= price` under `for update`, debits and inserts `user_cosmetics` in one transaction. **Shipped.** A cosmetic already owned returns its row without a second charge (Domain Rule 17). Equipping is not here: `user_cosmetics.equipped` is the one column a client may write, and `enforce_one_equipped_per_kind()` keeps the invariant. |
| **Phase 8** `evaluate_achievements(p_user_id)` · `achievement_earned(user, key)` · `habit_week_met(habit, week_start)` | Evaluates only the definitions the caller has *not* unlocked, inserts each `on conflict do nothing`, and awards `achievement_base` once per definition. **Shipped**, and called by four **statement** triggers — on `tasks(status)`, `calendar_blocks(insert, completed_at)`, `focus_sessions(status)` and `habit_completions` — rather than from each awarding function or from the ledger. Watching `xp_events` instead would have had a hole in it: a habit whose reward is zero, and a 90-minute session finished after the day's focus cap was full, both do real work and mint no ledger row. Each trigger does nothing when there is no `auth.uid()`, so the seed decides its own state. Not granted: nothing outside the database has a reason to ask. |
| **Phase 7 / 8** `xp_rule(name text) returns integer`                     | Single home for tunables. **Shipped in Phase 7** with the six `finish_focus_session` needs — `focus_per_minute 1`, `focus_min_session_minutes 5`, `focus_session_cap 120`, `focus_daily_cap 300`, `focus_planned_bonus_pct 10`, `priority_bonus_p1 5` — because this document defers a helper "with the functions that use them" and that is the first of them. It raises on an unknown name rather than returning null, so a missing tunable is an error and not a silently null award; Phase 8 adds `task_base` and the rest in the same `case`. Changing one is a migration **and** a one-line change to `FOCUS_XP` in `packages/core/src/focus/xp.ts`, which `packages/db/src/focus-rules.test.ts` pins to it by reading the migration as text. Internal; not granted. |
| **Phase 8** `level_for_xp(xp)` · `xp_for_level(level)`                   | The curve, finalised as proposed: cumulative XP to reach level L = `floor(100 * (L - 1) ^ 1.5)` (L2 = 100, L5 = 800, L10 = 2 700, L20 = 8 281, L40 = 24 355; per-level cost grows from 100 to ≈ 940). **Shipped**, with the reasoning and the first thirty thresholds in `docs/ARCHITECTURE.md` §16. `level_for_xp` corrects its analytic answer against `xp_for_level` in both directions, so floating point never decides a level. Both are internal; `@momentum/core/gamification` mirrors them for display and `packages/db/src/gamification-rules.test.ts` pins the two together. |
| **Phase 8** `reconcile_xp(user_id)` · `award_xp(...)` · `award_coins(...)` | `reconcile_xp` recomputes `profiles.xp` from the ledger and the level from it — audits, tests and `supabase/seed.sql`, never the UI. `award_xp` writes one ledger row and returns what actually landed (0 when the award was already minted or the day's cap was full), which is what lets a coin reward ride on the same decision. All three are the mint, and none is granted: publishing any of them would hand the client the amount. |

Exposure: a function is granted `execute` to `authenticated` when its phase adds it, and
`execute` is revoked from `PUBLIC` so nothing else in `public` is reachable over HTTP.

**(Phase 8, corrected against a live database.)** That was the design and it was not the
behaviour. `20260906121200_grants.sql` closed the surface with `alter default privileges in
schema public revoke execute on functions from public, anon, authenticated`, and that
statement does not reach functions created by later migrations: every function Phases 6, 7
and 8 added carried the built-in `PUBLIC EXECUTE` grant, `award_xp` — which takes an amount
as an argument — among them. `public.assert_caller` was the only internal that escaped, and
only because `20260906130100_guard_inserts.sql` had revoked it by name.
`20260907140000_gamification_functions.sql` therefore revokes `execute` **by name** from
every function in `public` and re-grants the sanctioned list below in full; the list is
asserted against the live catalogue by `packages/db/tests/gamification.test.ts` and against
the migration's text by `packages/db/src/gamification-rules.test.ts`. A per-schema
default-privileges revoke is not a security boundary.

**(Phase 13, 2026-09-09.)** The by-name revoke fixed the functions that existed; it did not
fix the *cause*, so the next migration to add a helper would have re-created the hole. The
built-in default (functions: `EXECUTE` to `PUBLIC`) can only be removed by the **global**,
schema-less form, which a per-schema `alter default privileges` cannot reach.
`20260909120000_security_default_privileges.sql` adds
`alter default privileges for role postgres revoke execute on functions from public`, so a
function created by any later migration is born reachable by no client role until it is
granted by name; the same migration revokes the still-open default sequence privileges from
`authenticated`. The by-name grant list above remains the exposure matrix.
Today that list is `is_trusted`, `is_valid_timezone` and `reject_guarded_write`, which the
`security invoker` triggers call as the signed-in role; the four Phase 3 added
(`complete_block`, `uncomplete_block`, `complete_task`, `uncomplete_task`); and the four
Phase 6 added (`record_habit_completion`, `remove_habit_completion`,
`complete_habit_block`, `uncomplete_habit_block`); and the six Phase 7 added
(`start_focus_session`, `pause_focus_session`, `resume_focus_session`,
`mark_interruption`, `finish_focus_session`, `abandon_focus_session`).
and the six Phase 8 added (`ensure_quest_assignments`, `quest_progress`, `claim_quest`,
`weekly_goal_progress`, `claim_weekly_goal`, `purchase_cosmetic`) — every one of which takes
ids and nothing else.

`habit_completion_id`, `xp_rule`, `xp_rule_unknown`, `focus_session_elapsed_minutes` and
`end_focus_session` are internal helpers of those bodies and are deliberately not among
them — `end_focus_session` in particular takes the ending status as an argument, which is a
decision its two wrappers make and a caller does not. Phase 8 adds a longer list of the
same kind, grouped by why: `award_xp`, `award_coins`, `cap_xp_event`, `apply_xp_event` and
`reconcile_xp` are the mint, and publishing any of them would hand the client the amount;
`xp_for_level`, `level_for_xp`, `xp_daily_cap` and `local_week_start` are pure arithmetic
the client already has in `@momentum/core`; `metric_progress`, `achievement_earned`,
`habit_week_met` and `assign_quests` are internals whose `user_id` argument the public
functions supply from a row rather than from the caller; and `quest_rotation_offset`,
`quest_assignment_id` and `weekly_goal_award_id` are naming schemes for rows the caller
already owns. Every other function in `public` either returns `trigger`, and cannot be
called directly at all, or is an internal helper of a `security definer` body and is
deliberately not granted.

---

## Row-level security matrix

| Table                     | select | insert | update                       | delete | Writes outside policy                  |
| ------------------------- | ------ | ------ | ---------------------------- | ------ | -------------------------------------- |
| `profiles`                | own    | —      | own (guard: xp, level, coins)| —      | `handle_new_user`, XP trigger          |
| `projects`                | own    | own    | own                          | own    | —                                      |
| `tasks`                   | own    | own    | own (guard: status, completed_at, actual_minutes) | own | `complete_task`, `uncomplete_task`, `finish_focus_session` |
| `calendar_blocks`         | own    | own    | own (guard: completed_at)    | own    | `complete_block`, `uncomplete_block`   |
| `habits`                  | own    | own    | own                          | own    | —                                      |
| `habit_completions`       | own    | —      | —                            | —      | `record_/remove_habit_completion`      |
| `focus_sessions`          | own    | —      | —                            | —      | focus lifecycle functions _(Phase 7)_  |
| `focus_pauses`            | own    | —      | —                            | —      | focus lifecycle functions _(Phase 7)_  |
| `xp_events`               | own    | —      | —                            | —      | awarding functions (append-only)       |
| `achievement_definitions` | all authenticated | — | —                        | —      | migrations                             |
| `user_achievements`       | own    | —      | —                            | —      | `evaluate_achievements`                |
| `quest_definitions`       | all authenticated | — | —                        | —      | migrations                             |
| `quest_assignments`       | own    | —      | —                            | —      | `ensure_quest_assignments`, `claim_quest` |
| `weekly_goals`            | own    | own    | own (guard: completed_at)    | own    | `claim_weekly_goal`                    |
| `cosmetic_definitions`    | all authenticated | — | —                        | —      | migrations                             |
| `user_cosmetics`          | own    | —      | own (`equipped` only)        | —      | `purchase_cosmetic`                    |
| `weekly_reviews`          | own    | own    | own                          | own    | —                                      |

"own" = `user_id = (select auth.uid())` (for `profiles`, `id = (select auth.uid())`).
`anon`: nothing.

The matrix is enforced twice. Policies decide which *rows* a statement may touch; the
grants in `20260906121200_grants.sql` decide which *verbs* the role has at all, and they
mirror this table line for line — `select, insert, update, delete` on the six read-write
tables, `select, update` on `profiles` and `user_cosmetics`, and `select` alone on every
ledger, lifecycle and definition table. A "—" cell is therefore two refusals deep: the
grant is missing and so is the policy.

`packages/db/tests/rls.test.ts` proves it rather than asserting it. It signs in as both
seeded users and, for every table in the list above, checks that the owner has rows worth
taking, that the neighbour reads none of them, that an unscoped `select` returns only the
neighbour's own rows, and that update and delete touch nothing. It then checks the "—"
cells directly (inserting into the ledgers, rewriting an XP award), the guarded columns
(XP, level, coins, task status and actuals, block completion), the cross-table ownership
triggers (a work block pointing at another account's task), and that a signed-out client
reaches nothing at all. Run it with `pnpm test:db` against a freshly reset stack.

---

## Index list

| Index                               | Table               | Supports                                                     |
| ----------------------------------- | ------------------- | ------------------------------------------------------------ |
| `projects_user_idx`                 | projects            | sidebar list                                                 |
| `tasks_user_status_due_idx`         | tasks               | Today, Upcoming, Completed, At Risk, overdue                 |
| `tasks_user_project_idx`            | tasks               | per-project view, ordering                                   |
| `tasks_parent_idx`                  | tasks               | subtask lists                                                |
| `blocks_user_start_idx`             | calendar_blocks     | week/day window, Today timeline, Next Up                     |
| `blocks_series_idx` (partial)       | calendar_blocks     | series candidates for a window                               |
| `blocks_override_uniq` (partial)    | calendar_blocks     | one override per occurrence; override lookup                 |
| `blocks_task_idx`                   | calendar_blocks     | coverage, "unscheduled" = no blocks, cascade                 |
| `blocks_habit_idx`                  | calendar_blocks     | habit week generation, cascade                               |
| `habits_user_idx`                   | habits              | habits page                                                  |
| `habit_completions_uniq`            | habit_completions   | Domain Rule 14                                               |
| `habit_completions_user_date_idx`   | habit_completions   | heatmaps, consistency, Today                                 |
| `focus_sessions_active_uniq`        | focus_sessions      | one live session                                             |
| `focus_sessions_user_started_idx`   | focus_sessions      | history, analytics windows                                   |
| `focus_pauses_open_uniq`            | focus_pauses        | one open pause                                               |
| `xp_events_source_uniq`             | xp_events           | idempotent awards                                            |
| `xp_events_user_created_idx`        | xp_events           | daily caps, history, reconcile                               |
| unique keys on assignments/goals/reviews/cosmetics | —    | one row per period / per user                                |

---

## Timezone at the storage layer

- Instants are `timestamptz`; the client receives ISO strings and mappers normalize to
  `Z`. Postgres never applies a session timezone to application logic: functions that need
  a local date compute it explicitly with `(now() at time zone p.timezone)::date` from the
  caller's `profiles.timezone`.
- `habit_completions.completion_date`, `tasks.due_date`, `quest_assignments.period_start`,
  `weekly_goals.week_start`, `weekly_reviews.week_start`, `calendar_blocks.occurrence_date`
  are `date` and always mean "in the user's timezone" (`occurrence_date`: in the series
  timezone).
- Daily focus caps and quest progress are computed over the user's local day, in SQL,
  from the profile timezone — never over a UTC day.

---

## Seed data (Phase 2)

`supabase/seed.sql`, applied by `supabase db reset`, creates two accounts:

| Account                | Password      | Role in the seed                                       |
| ---------------------- | ------------- | ------------------------------------------------------ |
| `demo@momentum.test`   | `momentum123` | The populated account (`America/New_York`, week starts Monday) |
| `second@momentum.test` | `momentum123` | The neighbour who must be able to see none of it (`Europe/London`, week starts Sunday) |

The first account holds 5 projects (one archived); 44 tasks across every status and
priority, with and without due dates and estimates, including three subtasks and 28
completed over the past eight weeks; nine work blocks, with the history essay owning three
of them on three different evenings; three events overlapping on the same Wednesday
afternoon, an all-day event, and a weekly lecture series with one occurrence moved and one
cancelled; one habit of every frequency type, with habit blocks for this week and eight
weeks of completions containing deliberate gaps (a skipped fortnight at the gym, a rest
day each week); eight weeks of focus sessions, some paused, a few abandoned; a weekly
goal, a completed weekly review, unlocked achievements, this week's quest assignments, one
purchased cosmetic; and an XP ledger consistent with all of it, with `profiles.xp` equal
to its sum.

Everything is positioned relative to `now()` in each profile's own timezone, so "this
week" is always this week and the seed never goes stale. It sets `momentum.trusted` for
the session rather than working around the guard triggers, because a seed that has to
subvert an invariant is a seed that stops testing it.

Two details a seed that inserts into `auth.users` directly has to get right, both found by
running it:

- **The token columns must be `''`, not null.** `confirmation_token`, `recovery_token`,
  `email_change` and `email_change_token_new` have no default, and GoTrue scans them into
  non-nullable strings. A null makes every later sign-in fail with `Database error
  querying schema` — the schema is fine; the row is not.
- **`profiles.xp` is reconciled from the ledger once, at the end of the file.** Awards are
  inserted by three separate blocks, so a per-block total was 50 XP short the moment the
  achievements block ran after it. The final statement is what `reconcile_xp()` will do in
  Phase 8.

The second account is deliberately small — a project, three tasks, a block, a habit, a
completion, a focus session and its pause, an unlock, a quest assignment, a weekly goal, a
weekly review and a cosmetic — but it has at least one row in every table the first account
does, so no cross-user assertion in the RLS suite is vacuous. The suite asserts that too:
"an unscoped select returns only the neighbour's own rows" proves nothing about a table the
neighbour has no rows in, so both accounts are checked for rows before either is checked
for leaks.

---

## Migration and type-generation workflow

```
pnpm db:start                                 # local stack (Docker); `supabase start`
supabase migration new <name>                 # supabase/migrations/<ts>_<name>.sql
pnpm db:reset                                 # apply every migration + seed.sql from scratch
pnpm db:types                                 # regenerate packages/db/src/database.types.ts
pnpm --filter @momentum/db typecheck          # enum parity fails here if the domain constants drift
pnpm test:db                                  # the RLS and signup suites against the local stack
pnpm db:stop
```

`supabase init` was run once, in Phase 2; `supabase/config.toml` is checked in, including
the `site_url` and redirect URLs the auth emails use. The CLI itself is not a workspace
dependency — install it with `brew install supabase/tap/supabase` (2.111 or newer).

`db:types` pipes the generator's output through Prettier, so the checked-in file passes
`pnpm lint` like every other file. Never edit it by hand: a migration and its regenerated
types ship in the same commit, and the enum-parity assertions in
`packages/db/src/enums.test.ts` stop compiling the moment the two disagree.

Nothing is configured only in the dashboard. A setting that cannot be expressed in a
migration is recorded in `docs/ROADMAP.md` as a known issue.

**Environment.** `apps/web/.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_APP_URL`; `supabase status` prints
the first two. `SUPABASE_SECRET_KEY` belongs only to the seed and the integration harness —
`apps/web/src/lib/env.ts` deliberately has no schema entry for it, so it cannot reach a
request path (docs/ARCHITECTURE.md §12).
