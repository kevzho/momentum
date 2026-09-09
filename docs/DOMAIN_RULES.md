# Momentum — Domain Rules

**Status:** Binding. These are the semantics the entire system depends on.
Violating one of these is a correctness bug, not a style disagreement.

Phase 0 extended this document (Rules 13–18). Later phases must not contradict it.

---

## 1. Due date ≠ scheduled time

A **due date** is a deadline: when the work must be finished by.
**Scheduled time** is intent: when the user plans to actually do the work.

They are independent. A task due Friday may be worked Monday, Tuesday, and Thursday.
A task may be scheduled with no due date. A task may have a due date and never be scheduled.

Never derive one from the other. Never store them in the same column. Never render them in
a way that implies they are the same thing.

## 2. Task ≠ work block

A **task** is a unit of work to be completed.
A **work block** is a reserved span of calendar time allocated toward a task.

**One task may own many work blocks.** This is required, not optional:

```
Task: "History essay"   due Friday   estimated 135m
  ├── WorkBlock  Mon 16:00–16:45   (45m)
  ├── WorkBlock  Tue 17:00–18:00   (60m)
  └── WorkBlock  Thu 19:00–19:30   (30m)
```

A single `scheduled_start` / `scheduled_end` pair on the task is an insufficient model.
If an early phase ships that shape, it must be refactored — not worked around in the UI.

Completing a task completes the task. Completing a work block does not necessarily complete
the task; it records that a planned span was executed. The relationship between the two is a
product decision recorded in the phase spec, but the *data model* must keep them distinct.

## 3. Planned duration ≠ actual duration

- `estimated_minutes` — user intent, set at capture or planning time.
- `actual_minutes` — derived from focus sessions and completion, never typed by the user
  as a substitute for the estimate.

Never overwrite the estimate with the actual. The gap between them is the product's most
valuable long-term signal (estimate calibration). Destroying it destroys the moat.

## 4. All timestamps are UTC; all boundaries are user-local

- Every `timestamptz` is stored in UTC.
- The user's IANA timezone lives on their profile.
- Every *boundary* question resolves in the user's timezone:
  - What counts as "today"?
  - What date does a habit completion belong to?
  - When does the week start?
  - Which day column does a block render in?

A block at 23:30 local is today, not tomorrow, regardless of the server's clock or the
UTC date. Never use the server's local time. Never use the browser's timezone in place of
the stored profile timezone for persisted logic.

**Habit completion dates are calendar dates, not timestamps.** Store `completion_date` as a
`date` computed in the user's timezone.

Week start (Monday vs Sunday) is a user preference with a default of Monday.
It is a setting, not a hardcoded constant.

## 5. All date/time logic is centralized

One shared module owns: timezone conversion, week boundaries, day boundaries, slot
snapping, duration math, recurrence expansion, and "is this today".

No ad-hoc `new Date()` arithmetic in components. No duplicated week-start logic.
Use `date-fns` (with the timezone helpers) through those utilities, not directly in UI code.

## 6. XP is never client-asserted

The client may request "I completed task X". The server decides how much XP that is worth,
records the `xp_event`, and updates the profile. The client never sends an XP amount.

XP calculation must be idempotent with respect to the triggering event: completing,
un-completing, and re-completing a task must not mint XP repeatedly.

Anti-farming rules are part of the calculation, not a UI restriction. Specifically:
focus XP is capped per session and per day, and trivially short sessions do not earn.
Every other repeatable source is capped per local day as well; see §20.

## 7. Gamification is never punitive

- No XP loss.
- No streak destruction that erases accumulated progress.
- No moralizing language anywhere in the product: never "lazy", "unproductive", "failure",
  "you're behind", "bad week".
- Missing a day reduces a *rate* (consistency %), it does not delete history or XP.
- Quests never encourage unhealthy volumes of work.

Track **consistency**, not fragile streaks. Best streak may be displayed as an achievement;
it must never be the primary motivator or the thing the user fears losing.

## 8. Analytics report correlation, never causation

Observational productivity data cannot support causal claims.

Say: "Your completion rate has been higher for morning blocks during this period."
Never say: "You work better in the morning."

Only surface an insight when the sample size is sufficient. Define and enforce a minimum
threshold; suppress the insight below it rather than showing a noisy one.

## 9. All user-owned data is RLS-protected

Every table containing user data has row-level security enabled with policies scoped to
`auth.uid()`. This is not optional for any table, including join tables and progress tables.

Authorization is enforced at the database, not only in the application layer. A missing
policy is a security bug even if no UI path currently exposes it.

## 10. Every drag has a keyboard path

Every action achievable by dragging — scheduling a task, moving a block, resizing a block,
reordering a list — must be achievable via keyboard alone, and must be announced to
assistive technology.

Drag-and-drop is an accelerator, never the only route.

## 11. Optimistic updates must roll back

Any mutation applied optimistically must revert cleanly on failure and surface the failure
to the user. Silent divergence between the UI and the database is a P0 bug.

## 12. Web is canonical

Domain logic, scheduling algorithms, task management, gamification, analytics, database
types, and reusable UI live in shared packages. Platform-specific code is isolated behind a
capabilities layer. The desktop app wraps the shared application; it never reimplements it.

## 13. One calendar table; blocks belong to their parent

Every time-bound thing — event, task work block, habit block — is a row in
`calendar_blocks` with a `kind`. A work block always has a task; a habit block always has
a habit; an event has neither. The database enforces this per kind. Deleting a task or a
habit deletes its blocks (they have no meaning alone). Deleting a block never touches the
task or habit.

**Completing a work block means "this span was executed."** It records `completed_at` on
the block and nothing else. The control on a block is labelled by what it will do:

- If the block is the task's only block, or the last incomplete one, the control reads
  **Complete task** and completes both the block and the task.
- Otherwise it reads **Done with this block** and completes only the block.

Completing a task from anywhere else (list, detail sheet, palette) completes the task and
leaves its blocks untouched. Incomplete future blocks of a completed task stay on the
calendar, render as settled, are treated as free time by capacity and Find Time math, and
are skipped by Next Up. Un-completing the task restores them. Nothing is deleted.

**Un-completing a block reverses exactly what completing it did** _(decided in Phase 3, as
`specs/03-weekly-calendar.md` instructs)_. A completed block's control reads **Mark as not
done**; when the block's task is complete, it reads **Mark as not done and reopen task**
and does both, in one transaction. The two directions are one reversible user action: a
control that completes a task and then cannot undo it strands the user, and until the task
manager exists there is nowhere else to undo it from. The symmetry is carried explicitly
by the caller — `complete_block(id, also_complete_task)` and
`uncomplete_block(id, also_uncomplete_task)` — never inferred inside the function, so the
label and the effect are decided in the same place and cannot drift apart.

This does not weaken the paragraph above it: completing a task *from anywhere else* still
leaves its blocks alone, and un-completing a block that did not complete its task still
says nothing about the task.

## 14. One habit completion row per habit per local date

For every frequency type, `habit_completions` holds at most one row per `(habit_id,
completion_date)`; `amount` accumulates within the day. Completing from a calendar block
and from the habits page upsert the same row. Boolean habits (daily, weekdays,
times-per-week) treat a second completion on the same day as a no-op; amount habits add to
`amount`. The uniqueness is a database constraint, not a UI check.

## 15. Trusted writes go through database functions

Because the browser holds the user's own JWT and can call the database API directly, any
column a row-level policy allows the user to write is client-writable no matter what the
application server does. Therefore:

- `xp_events`, `user_achievements`, `quest_assignments`, `focus_sessions`, and
  `focus_pauses` are **client-read-only**. They are written only by `security definer`
  database functions (`complete_task`, `start_focus_session`, `finish_focus_session`,
  `record_habit_completion`, `claim_quest`, …).
- `profiles.xp`, `profiles.level`, `profiles.coins`, `tasks.status`,
  `tasks.completed_at`, and `tasks.actual_minutes` are never client-updatable columns.
- Those functions stamp times with the database clock (`now()`), never with a
  client-supplied timestamp. This is what makes the focus timer trustworthy and XP
  farm-resistant.
- Ledgers are append-only. XP is never deleted or negated (Rule 7); un-completing a task
  does not remove its XP event, and the ledger's uniqueness prevents a second award on
  re-completion (Rule 6).

## 16. Recurring occurrences keep wall-clock time

Only events recur. A recurring event is a **series** row carrying its rule and the IANA
timezone the schedule was defined in. Occurrences are expanded at query time for the
requested window and keep the series' wall-clock time in that timezone: a 09:00 class is at
09:00 on both sides of a DST transition, even though its UTC instant shifts. Editing one
occurrence writes an **override** row linked to the series and the occurrence date;
deleting one writes a cancelled override. Occurrences are never materialized ahead of time.

## 17. Optimistic creates use client-generated ids

A client that creates a row generates its UUID. The optimistic row and the persisted row
share a key, retries after a network failure are idempotent (a duplicate insert is treated
as success), and no mutation ever needs a temporary id swapped for a real one.

## 18. The desktop shell loads the deployed web app

The web app is server-rendered and is the only implementation. The desktop shell (Phase
15) is a native window that loads the hosted application and injects platform capabilities
through the capabilities layer; auxiliary native windows (menu-bar timer, global quick
add) load small routes of the same deployed app. There is no static export, no bundled
copy of the frontend, and no second data-access path.

---

## 19. Clarifications from the Phase 0–5 integration audit

None of the following changes a rule. Each records what a rule already meant, at a seam
where the implementation had drifted from it and the audit had to decide which side was
right. They are written down so the next phase does not re-litigate them.

**A block's title belongs to its parent (Rules 2 and 13).** `calendar_blocks.title` is a
column an *event* owns. A work block shows its task's title and a habit block shows its
habit's; both resolve at read time, which is what makes it impossible for the two to
drift. Therefore nothing may write a resolved parent title back into the block's own
column — doing so freezes the block at the parent's name as of that save and severs the
link the rule exists to guarantee. `blocks_event_title_chk` states the same thing from the
database's side.

**Only an event may be an override (Rule 16).** "Only events recur" constrains the
override row as well as the series row. A `work` or `habit` row carrying `series_id` is
unrepresentable in the domain, and the read path cannot classify it. The database enforces
this on both sides.

**There is one wall-clock-span → instants rule (Rules 4 and 5).** Converting
`{ date, startMinutes, endMinutes }` to a pair of instants is domain logic with a DST
subtlety — a span straddling the far edge of a spring-forward gap resolves out of order
and must keep its drawn length. `intervalOfSlot` in `@momentum/core/scheduling` is that
rule. Optimistic overlays are not a place to re-derive it: an overlay that converts spans
its own way will disagree with the row the server writes on exactly the days the rule
exists for.

**A date picker's `Date` objects are scaffolding, not data (Rule 4).** A calendar widget
builds its grid from host-local `Date`s. Reading UTC calendar fields off one of those is a
timezone conversion nobody asked for, and it moves the day for every user east of UTC. The
persisted value is the `LocalDate`; the `Date` must never escape the component, and both
edges of the conversion must use the same convention or the widget is off by one in one
direction.

**A rejected action is a failed action (Rule 11).** "Roll back cleanly and surface the
failure" covers the call that never returns — offline, 5xx, aborted, a server action
missing after a deploy — not only the call that returns `{ ok: false }`. Both take the
same path: roll back, tell the user, release whatever the mutation disabled. An unhandled
rejection reaching an error boundary blanks the route, which is silent divergence with
extra steps. Framework control-flow throws (`redirect()`, `notFound()`) are the exception
and must still propagate.

**A client-generated id identifies the row, not the attempt (Rule 17).** The id is minted
once, when the user asks for the row to exist. Every retry of that create — including one
the user triggers from a failure toast — sends the same id, which is the whole of what
makes the retry idempotent. Minting a fresh id per attempt turns a lost response into a
duplicate row.

**Escape discards; blur commits (Rule 11, by extension).** In a commit-on-blur field,
`blur()` dispatches synchronously, before the framework re-renders — so a handler that
resets its draft and then blurs in the same turn still commits the pre-reset draft. The
abandonment has to be recorded somewhere the blur handler reads at the moment it runs, not
somewhere the render that built it closed over.

---

## 20. Clarifications from Phase 8

None of the following changes a rule. Each records what a rule already meant, at the point
the gamification phase had to make it concrete.

**An award is keyed on the fact, not on the row that recorded it (Rule 6).** "Completing,
un-completing and re-completing must not mint XP repeatedly" is a statement about the
*fact* being paid for once. Where the row carrying that fact is one the client can destroy
and recreate, keying the ledger on its id makes the rule false: delete a weekly goal,
create it again, claim it again, and the uniqueness index has nothing to collide with.
Phase 6 already answered this for habit completions (`habit_completion_id` derives the id
from `(habit, date)`); Phase 8 applies the same reasoning to weekly goals, whose award is
keyed on `(user, week_start, metric)` — the pair `weekly_goals_uniq` already calls the
row's identity. A coin reward rides on the ledger accepting the XP row, so the two are
minted together or not at all.

**Anti-farming belongs at the ledger, not at each call site (Rule 6).** Rule 6 names focus
XP specifically because focus was the first source with a cap; the sentence is an example,
not the extent of the rule. Every source that a user can repeat at will is capped per local
day — tasks and habit completions as well as focus — and the caps are applied by a `before
insert` trigger on `xp_events` rather than by each awarding function, so a source added by
a later phase is capped by default and the rule cannot be forgotten at a call site. A cap
bounds the *reward* and nothing else: the task still completes, the minutes are still
recorded (Rule 3), and nothing already earned is touched (Rule 7).

**A privilege the database does not actually withhold is not a boundary (Rule 15).** Rule
15 says trusted writes go through `security definer` functions because the browser holds
the user's own JWT and can call the database API directly. That argument only holds while
the *untrusted* functions are unreachable, and the first live application of these
migrations showed they were not: `alter default privileges ... revoke execute on functions`
does not reach functions created afterwards, so `award_xp` — which takes an XP amount as an
argument — was callable from a browser. Every claim of this kind must be asserted against
the live catalogue, not against the statement that was supposed to establish it. The
exposure matrix is now revoked and granted by name, and a database test enumerates exactly
what `authenticated` may execute.

**"No streak destruction" is a constraint on how an achievement counts, too (Rule 7).**
"Hit a habit's target five weeks" could be read as five *consecutive* weeks, which would
make it a streak with all the fear that implies. It counts weeks met, in any order; a week
that went badly subtracts nothing and delays nothing. The same reading governs every future
achievement: count what happened, never punish what did not.

---

## 21. Changes from the Phase 13 security audit (2026-09-09)

Unlike §19 and §20, two of these **change** an earlier rule. Each is recorded here with
its reason, as the constitution requires, and shipped with the migration that makes it true
(`supabase/migrations/20260909120*`).

**The daily XP cap is a rolling 24-hour window, not a calendar day (amends Rule 6 / §20).**
§20 said every repeatable source is "capped per local day". The audit showed that made the
cap resettable: the cap window resolved in `profiles.timezone`, which the client can write,
so switching to a timezone whose local midnight had just passed made every earlier award
"yesterday" and reopened the full cap — roughly 30x the intended amount for a scripted
account, across tasks, habits and focus alike. The cap is now measured over
`created_at > now() - interval '24 hours'`, which depends on no client setting. This is a
deliberate exception to Rule 4 ("every boundary resolves in the user's timezone"): the cap
boundary is an anti-farm mechanism, not a user-facing day, and a rolling window is strictly
not weaker than a calendar day (a calendar day let a user earn the full cap at 23:59 and
again at 00:01). `cap_xp_event` also takes a per-user row lock before it reads the window,
so concurrent awards cannot both pass an under-cap check.

**A weekly goal can be created only for the user's current week (tightens Rule 6/7).** The
award is keyed on `(user, week_start, metric)` (§20), but nothing required `week_start` to
be a real, current week boundary, so a client could POST one goal per calendar *date* per
metric — overlapping windows that all counted the same work — and claim each, or backfill
goals for every past week and claim them against history. `guard_weekly_goals` now requires
`week_start` to be the first day of the caller's current local week (exactly what the app
computed and the database did not enforce), and freezes `week_start`, `metric` and `target`
once set. A goal created this week remains claimable later — nothing is withdrawn (Rule 7).

**Quest assignments are one set per real period (upholds Rule 6).** `ensure_quest_assignments`
resolved the period from `profiles.timezone`/`week_start`; sweeping those spawned extra
overlapping assignments that each paid for the same work. `assign_quests` now records the
timezone a period was resolved in and refuses to create a set whose window overlaps one the
user already holds — so a timezone/week-start sweep yields no extra quests. `ensure_quest_assignments` returns by the same window rule — every held assignment
whose window, in the zone it was assigned in, contains now — so the one set a user holds stays
visible across a timezone change (`20260909150000_quest_visibility.sql`).

**Creation timestamps are the database's (upholds Rule 15).** `created_at` was client-writable
on every table; it is now stamped on insert and immutable thereafter (`freeze_created_at`),
except for trusted logic such as the seed backdating history.

## 22. Clarifications from the Phase 13 audit (2026-09-09)

None of these changes a rule; each records what a rule already meant at a seam the audit
found drifting.

**A tick on an amount habit records the remainder of its period (Rule 14).** One row per
habit per local date with `amount` accumulating says nothing about what a single press is
worth, and both surfaces had answered "1" — so a 120-minute-a-week habit read Done after one
press. A press records what is left of the target for the period the habit is measured on:
today's target for `amount_per_day`, the week's remainder for `amount_per_week`. The rule
is `amountToRecord` in `@momentum/core/habits`, and the habits page and Today both call it.

**The UI describes the cap the ledger enforces (Rule 6 / §21).** §21 moved the cap to a
rolling 24-hour window; the "today's limits" figures were still summed over the local
calendar day, so they could disagree with the trigger by a whole cap. The display reads the
same window (`xpCapWindow`) and says "in the last 24 hours". Today's own "XP today" remains
the local day: it is earnings, not a cap.

**A failed call is a failed call on every surface (Rule 11 / §19).** The `useOptimisticAction`
catch — `unstable_rethrow`, report, `unavailable`, toast with Retry — is the whole path, and
the audit found two mutations (focus lifecycle, quest claim) that ran an action directly and
so let a rejected call reach the route's error boundary. Any surface that calls an action
outside the hook must take the same path; a validation failure offers no Retry, because
retrying the same input cannot succeed.

**Focus never lands on `<body>` (Rule 10).** Nine findings were one defect: a control
natively disabled while it was focused, or a surface closing without handing focus on. The
mechanism is `aria-disabled` plus a handler guard, and an explicit hand-off — to the opener,
in the commit that closes the surface, or to a tab-order neighbour when the opener is gone.

---

| Term | Meaning |
|---|---|
| **Task** | A unit of work to complete. May be unscheduled. |
| **Work block** | A span of calendar time allocated toward a task. |
| **Event** | A calendar block not backed by a task (class, meeting, appointment). |
| **Habit block** | A calendar block generated from a habit's schedule. |
| **Focus session** | A timed working period that records actual minutes. |
| **Estimate** | User-declared expected duration. |
| **Actual** | Measured time spent, derived from focus sessions. |
| **Capacity** | Available hours in a period, from working-hours config minus commitments. |
| **Consistency** | Completion rate over a window. Not a streak. |
| **Series** | A recurring event row: the rule plus the timezone it is defined in. |
| **Occurrence** | One expanded instance of a series for a specific date. Virtual until edited. |
| **Override** | A stored row that replaces (or cancels) one occurrence of a series. |
| **Ledger** | An append-only table written only by trusted database logic (`xp_events`). |
| **Coverage** | Minutes of work blocks scheduled for a task versus its estimate. |
