# Momentum — Scheduling: Find Time, capacity and conflicts

**Status:** Phase 5. This document describes `@momentum/core/scheduling`
(`packages/core/src/scheduling/`), the module behind the planning drawer's capacity
display, its warnings, and the Find Time engine (`specs/05-week-planning.md`). It is
written for the engineer who has to change a ranking rule, explain a suggestion a user
did not expect, or plug a later phase in without breaking the guarantees below.

---

## 1. Purpose and guarantees

Find Time answers one question: _for this task, with this duration and (optionally) this
deadline, where in the planning range could a work block go, and why there?_ It returns
ranked candidate slots, each with a one-sentence explanation, so the user can accept one
with a click. The drawer schedules `candidate.span` through the same action a drag uses;
the engine itself writes nothing.

Guarantees, each of which a test enforces:

- **Pure.** `findTime(input: FindTimeInput): FindTimeResult` reads nothing but its
  argument. The clock is `input.now`; the timezone is `input.context.timezone`; the
  blocks are `input.commitments`. There is no database row, no React, no `Date` in any
  type it touches (`types.ts`).
- **Deterministic.** Same input → identical output, including the order of candidates and
  every string. Reordering `commitments` changes nothing (`find-time.test.ts`
  "determinism").
- **No model, no network, no randomness.** The spec's non-goal is binding: there is no
  LLM in this path and nothing here is trained, sampled or fetched.
- **Runs anywhere.** The same code executes on the server, in the browser (over the
  optimistic week, so suggestions update live during planning) and in the Vitest suite,
  which runs twice, under `TZ=UTC` and `TZ=America/Los_Angeles`, to prove no function
  reads the process timezone.
- **What is scored is what is written.** Every candidate's wall-clock `span` resolves
  through `intervalOfSlot` — the rule the server's `spanInstants` applies — to exactly
  `startAt`/`endAt`. A slot that would not is not offered (§9).
- **Nothing here judges anyone.** Explanations and notes state facts about the schedule
  (Domain Rule 7). A test greps every string against the banned vocabulary.

## 2. Inputs

`FindTimeInput` (`packages/core/src/scheduling/types.ts`):

| Field             | Meaning                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `task`            | `id`, `title`, `dueDate`. The deadline is a `LocalDate` and never a schedule (Rule 1).   |
| `durationMinutes` | The block length to place: the estimate, or the caller's fallback for an unestimated task. Rounded, floored at 1. |
| `commitments`     | Every block on the range, as `Commitment`s (below). The optimistic list when called from the client. |
| `context`         | `timezone`, `workingHours`, `focusWindows`, `days` (the range, in order), `today`.       |
| `now`             | Nothing starts before this instant. Injected; never read from a clock.                   |
| `snapMinutes`     | Candidate starts land on this increment (the profile's setting).                         |
| `limit`           | How many candidates to return. Defaults to `DEFAULT_FIND_TIME_LIMIT` (5); floored at 1.  |

**A `Commitment`** is a calendar block as the scheduler sees it: kind, title, `startAt`,
`endAt`, `allDay`, `completedAt`, and for work blocks `taskId`, `taskDueDate` and
`taskCompletedAt`. Whether a commitment claims time is decided in exactly one place,
`occupiesTime` in `intervals.ts`:

- an all-day item occupies nothing (a birthday does not block a working day);
- **Domain Rule 13:** an unexecuted block of a completed task (`taskCompletedAt` set,
  `completedAt` null) stays on the board as settled and is _free time_ to capacity and
  Find Time;
- everything else — events, outstanding work, executed work, habit blocks — occupies the
  time it covers, done or not.

`busyIntervals(commitments)` is the merged, ordered list of what occupies time;
`commitmentsOverlapping(commitments, interval)` names the blocks a slot would cross, in
start order then id order, which is what makes the `overlaps` list deterministic.

**Working hours** are `WorkingHours`: a list of `TimeWindow`s (`HH:MM`–`HH:MM`, within one
day) per weekday. A weekday with no windows is a day off. `workingIntervalsOn(date,
workingHours, tz)` resolves the windows for the weekday `date` falls on into instants via
`fromLocal`, merging overlaps so a duplicated row cannot double capacity. Windows are
honoured wherever they lie: an evening worker's 22:00–23:59 window is working hours.

**Focus windows** (`context.focusWindows`) are `TimeWindow`s that apply to every day
alike; `focusIntervalsOn` resolves them the same way. Empty when the user has configured
none — then every candidate is neutral on the fifth criterion.

**`now` and `today`.** `today` must be `todayIn(tz, now)` — the caller resolves it once
per request in the profile timezone (Domain Rule 4). Days before `today` are skipped; on
`today`, nothing starts before `now`.

**Snap.** `snapInstantUp(at, snapMinutes, tz)` moves an instant forward to the next
wall-clock boundary and never backwards (in a fall-back overlap, backwards would land in
the past). Snapping is applied to starts only; a 50-minute block starts on a boundary and
is 50 minutes long, exactly as a drag places it.

## 3. Vocabulary

- **Elapsed minutes** are what a block costs the week: `durationMinutes(startAt, endAt)`.
  **Wall-clock minutes** are where it sits on the grid: `minutesFromMidnight`. They differ
  by an hour on two days a year, and the engine never computes one from the other. Every
  interval is elapsed; `SlotSpan` is wall clock, read off with `slotOf` at the edge.
- A **free interval** is a maximal stretch of one local day, from `now` on, that no
  occupying commitment covers: `subtractIntervals([dayBounds(date)], busyIntervals(…))`
  clipped to start no earlier than `now`.
- An **open window** is the free interval a candidate was cut from; its elapsed length is
  `candidate.openWindowMinutes` and is what "2-hour open window" reports.
- A **fragment** is a leftover an open window would be left with after the block is placed
  that is too short to use (§5, criterion 4).
- The **suggestion window** is `SUGGESTION_WINDOW = 07:00–22:00`, the hours inside which a
  slot _outside_ working hours may be suggested (§4).

## 4. Candidate generation

1. **Search span.** The days in `context.days`, in order, skipping any before `today` and
   any whose `dayBounds` end at or before `now`. If `context.days` is empty the outcome is
   `"nothing"`; if every day is over, `"range-past"`.
2. **Free time per day.** For each searchable day: the free intervals as defined above,
   the day's working intervals, its focus intervals, and the suggestion window resolved on
   that date (`windowIntervalsOn(date, [SUGGESTION_WINDOW], tz)`).
3. **Candidate starts.** For every free interval `F` at least `durationMinutes` long, the
   candidate starts are: the start of `F`; the start of every working interval, every
   focus interval and the suggestion window whose start lies inside `F`. Each is snapped up
   with `snapInstantUp`, and kept only if the block — `[start, addMinutes(start,
   duration))`, elapsed — still ends inside `F`. Starts are deduplicated by instant.

   The suggestion window's start is a source for the same reason the working windows'
   starts are: it is where an off-hours placement may begin. Without it a free day with no
   working hours would offer only its 00:00 start, lose it to the rule below, and offer
   nothing.

   **The off-hours rule.** A candidate not entirely inside a working interval is kept only
   if it lies entirely inside the suggestion window on its day. A 00:15 AM slot is a valid
   free interval and a useless suggestion; a working window, wherever it lies, is honoured
   in full. The rule is applied in both search paths (§7), which is what guarantees that a
   fallback candidate really does overlap something.

Candidates are then scored (§5), ranked (§6) and diversified (§6).

## 5. The five ranking criteria

`CandidateScore` carries the five criteria of `specs/05`, in the spec's order. They are
compared **lexicographically** — a later field is consulted only when every earlier one
ties — and nothing is weighted or summed. That is a deliberate property, not a
simplification: any ordering can be explained by pointing at the first field on which two
candidates differ, which is the only kind of explanation a user can check.

1. **`beforeDeadline`** — `true` when the slot ends at or before `endOfDay(dueDate, tz)`,
   and always `true` for an undated task. First because a slot after the deadline does not
   do the job the deadline exists for; a slot before it, even a poor one, does. The bound
   is the end of the local due date, so a block ending 23:59 on the due date is before it.
2. **`withinWorkingHours`** — some working interval contains the whole slot. Second
   because working hours are the user's own statement of when work happens; an off-hours
   slot is offered (inside the suggestion window) but ranks below any in-hours slot.
3. **`conflicts`** — `commitmentsOverlapping(commitments, slot).length`. Zero for every
   open-window candidate by construction; it only separates candidates in the fallback
   path (§7), where fewer overlapped blocks is the more honest placement.
4. **`fragments`** — of the two leftovers the open window would keep around the block
   (front: `slot.start − F.start`; back: `F.end − slot.end`, both elapsed), the number that
   are **at least one snap increment and shorter than `MIN_USEFUL_GAP_MINUTES` (30)**. A
   leftover of thirty minutes or more is somewhere a person can do something and is not a
   cost. A leftover shorter than one snap increment cannot hold any block at all and is
   the same for every candidate in that window — the odd 8 minutes between 10:37 and the
   next 10:45 boundary is left behind whichever start is chosen — so it carries no
   information about _this_ placement and is ignored. Between the two lies the scrap the
   criterion exists to avoid: a 15-minute hole a block could technically fill and nobody
   would want to. Consequence worth knowing: with a 30-minute snap no leftover can be a
   fragment, so the criterion is silent and ordering falls through to focus and start.
5. **`focusFit`** — 2 when a focus interval contains the slot, 1 when one merely overlaps
   it, 0 otherwise. Last because it is a preference layered on top of a plan that already
   works: it chooses between slots that are all before the deadline, in working hours,
   conflict-free and tidy. With no focus windows every candidate scores 0 and the
   criterion is neutral, which is why configuring none costs nothing.

`openWindowMinutes` and `overlaps` are carried on the candidate for the explanation, not
for the ordering.

## 6. Tie-breaks and diversity

After the five criteria: `startAt` (earlier first), then `span.date`, `span.startMinutes`,
`span.endMinutes`. Starts are deduplicated per search, so `startAt` already makes the
order total; the span fields are there so the comparator is total by inspection.

**Diversity.** `PER_DAY_LIMIT = 2`. The ranked list is walked, taking candidates until
`limit`, skipping any whose date already has two picks; if the walk runs out with fewer
than `limit`, the skipped candidates fill the rest in rank order. The returned list is in
rank order throughout. Five slots on the same Monday is a list, not a choice; but when
Monday is the only open day, the user still gets up to `limit` from it.

## 7. Fallbacks

Every outcome is a `FindTimeOutcome`, and every one that needs words carries a `note`.

- **`found`** — every candidate is an open slot. `note` is null unless the deadline has
  passed (below).
- **`fallback-overlaps`** — no open window anywhere fits. Overlapping candidates are
  generated from each searchable day's natural boundaries: the start of each working
  interval (or the suggestion window's start on a day with none) and the end instant of
  each occupying commitment on the day, snapped up, starting at or after `now`, ending
  inside the day, and passing the off-hours rule. They are scored the same way —
  `conflicts` is now positive and `overlaps` names the blocks; `openWindowMinutes` and
  `fragments` are 0 — then ranked, diversified and capped. The note names what would have
  fitted: _"No open window in this range fits 3h; the longest open window is 2h on Mon
  Sep 7. These times overlap existing blocks."_ — or, when there is no free time at all,
  _"There is no open time in this range; these times overlap existing blocks."_

  That every fallback candidate overlaps something is provable rather than hoped: a
  boundary start that fits an open window and passes the off-hours rule is precisely a
  start the open-window search would have produced, so its absence there implies the
  overlap. The code filters on `conflicts > 0` anyway, to keep the contract explicit.

- **`longer-than-any-gap`** — nothing open fits and `durationMinutes > 1440`: longer than
  any day, so an overlapping placement could not end inside one either. No candidates;
  the note says the length is longer than a day and that it can be scheduled as several
  shorter blocks. The user does the splitting — auto-splitting is a non-goal of the spec.
- **`range-past`** — every day in the range ends at or before `now`.
- **`nothing`** — an empty range, or a range in which even an overlapping placement cannot
  end inside a day (23:30 on the last day, with a two-hour task).

**Deadline already passed** (`dueDate < today`). The search runs as normal; every candidate
has `beforeDeadline = false`, the outcome is still `found` (or the fallback), and the note
reads _"The Sep 4 deadline has passed; these times are after it."_ — appended after the
fallback note when both apply.

## 8. The explanation grammar

One sentence per candidate, built from fixed clauses so the same input always yields the
same words:

```
<day> <time range> — <window clause | overlap clause><deadline clause><hours clause><focus clause>.
```

- `<day>`: the weekday name ("Wednesday") when the date is within the seven days starting
  at `today`; otherwise "Wed Sep 16" (`formatLocalDate` `weekday` + `monthDay`).
- `<time range>`: wall clock from the span, 12-hour, en dash, meridiem written once when
  both ends share it: "4:00–5:00 PM", "11:30 AM–12:30 PM".
- `<window clause>`: "exact fit" when the open window equals the block; "2-hour open
  window" for whole hours; "45-minute open window" under an hour; otherwise the product's
  one duration format, "1h 30m open window".
- `<overlap clause>` (fallback only): "overlaps Standup", "overlaps Standup and Review",
  "overlaps A, B and C".
- `<deadline clause>`: " before Thursday deadline" / " after the Thursday deadline"; a
  deadline beyond the coming week reads as a date, "Sep 16 deadline". Nothing for an
  undated task.
- `<hours clause>`: ", outside working hours" when `withinWorkingHours` is false.
- `<focus clause>`: ", in a focus window" (fit 2) or ", partly in a focus window" (fit 1).

The spec's example is a fixture: _"Wednesday 4:00–5:00 PM — 2-hour open window before
Thursday deadline."_ There is no "best", no "ideal", no exclamation, and no clause about
the person.

## 9. DST behaviour

Everything is computed in instants and measured in elapsed minutes; wall clock enters only
at the edges (`fromLocal` in, `slotOf` out). The tests pin these cases:

- **Spring forward, New York 2026-03-08.** A 60-minute block starting 01:30 ends at
  `03:30` on the clock: `span = {startMinutes: 90, endMinutes: 210}`,
  `durationMinutes(startAt, endAt) === 60`. `endMinutes` is the end instant's own reading
  (`toDayInterval`), never `startMinutes + 60`.
- **Fall back, New York 2026-11-01.** A three-hour block from 01:00 EDT reads 01:00–03:00
  and is 180 elapsed minutes; its span `{60, 180}` resolves back through `intervalOfSlot`
  to the same instants. Some readings on this night cannot round-trip — a block 01:00–02:00
  EDT reads `{60, 60}`, and a start in the second pass of the repeated hour resolves to the
  first — and `fromLocal` (and therefore the server) takes the first occurrence. The
  engine drops any candidate whose span does not round-trip, so at 01:10 EST the first
  suggestion is 07:00, not a 01:15 the action would have written an hour earlier.
- **Santiago 2026-09-06**, whose day begins at 01:00 because the clock moves at midnight:
  nothing is suggested before `startOfDay` (04:00Z), the first candidate in a
  00:00–08:00 working window reads `{60, 120}`, and the day's open window is 1380 elapsed
  minutes — "23-hour open window".
- An ordinary 09:00–17:00 window on either transition day yields ordinary candidates:
  `{540, 600}`, 60 elapsed minutes, inside working hours.

## 10. Out of scope, and where later phases plug in

Deliberately not here (spec non-goals): automatic rescheduling, auto-splitting a task into
several blocks, multi-week planning, historical estimate calibration, and any AI or model.

Where they would attach, without touching the ranking:

- **Estimate calibration (Phase 10)** adjusts `durationMinutes` _before_ the call — the
  engine places whatever length it is given and does not know or care whether it is an
  estimate or a calibrated one. Domain Rule 3 stays intact: the task's `estimatedMinutes`
  is never rewritten.
- **Splitting** would be a caller that runs `findTime` more than once with the pieces,
  feeding each accepted block back in as a commitment. The engine already treats the
  optimistic week as input, so nothing changes below it.
- **Multi-week** is a longer `context.days`; the search is per day and the diversity rule
  is per date, so the engine is indifferent to the range's length. The reasons it is not
  offered are product reasons, not engine ones.
- **A different suggestion window** is `SUGGESTION_WINDOW` in `find-time.ts` — the one
  tunable. Everything else is derived from the input or from `MIN_USEFUL_GAP_MINUTES` in
  `intervals.ts`, which is shared with the warnings and must not be duplicated.

## Capacity and conflicts

`packages/core/src/scheduling/capacity.ts` and `conflicts.ts`. Pure functions over an
explicit input (`CapacityInput`, `ConflictInput`): the range's commitments, the tasks
competing for it, the `PlanningContext` (timezone, working hours, focus windows, days,
today) and — for the insufficient-time check only — an injected `now`. Nothing reads a
clock. Every number is **elapsed** minutes (Domain Rule 3), built on the interval
arithmetic in `intervals.ts`; wall clock never enters these two files.

### Definitions

**Which blocks count** is decided once, by `occupiesTime` (Domain Rule 13): events,
outstanding work, executed work and habit blocks occupy the time they cover; an
unexecuted block of a completed task is settled and is free time; an all-day item
occupies nothing. Neither file re-derives that rule.

**Per day** — `DayWorkload`, one per `context.days` entry, in order:

| Field              | Definition                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plannedMinutes`   | Σ elapsed minutes of every commitment that `occupiesTime`, each **clipped to `dayBounds(date)`** and summed **block by block, without merging**. |
| `workMinutes`      | The part of `plannedMinutes` from `work` and `habit` blocks.                                                                                     |
| `eventMinutes`     | The part from `event` blocks. `workMinutes + eventMinutes === plannedMinutes`.                                                                   |
| `workingMinutes`   | `totalMinutes(workingIntervalsOn(date, workingHours, tz))`. 0 on a day off.                                                                      |
| `availableMinutes` | `totalMinutes(subtractIntervals(workingIntervals, busyIntervals(commitments)))` — working time no commitment covers. Never negative.             |
| `isPast`           | `date < context.today`.                                                                                                                          |
| `weekday`          | `weekdayOf(date)`.                                                                                                                               |

Clipping to the day is by instants, so a block from 23:30 to 00:30 gives 30 minutes to
each of two days, and a block written for a morning whose midnight does not exist
(Santiago, 2026-09-06) is charged what the clock actually ran.

**Week** — `WeekCapacity`, the three lines of the drawer:

| Line             | Field                | Definition                                                                                                              |
| ---------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PLANNED          | `plannedMinutes`     | Σ day `plannedMinutes`, past days included.                                                                             |
| AVAILABLE        | `availableMinutes`   | Σ day `availableMinutes` over days with `!isPast`. Today counts in full.                                                |
| UNSCHEDULED WORK | `unscheduledMinutes` | Σ `remainingMinutesOf(task, commitments)` over `tasks`, each task id counted once.                                      |
| —                | `workingMinutes`     | Σ day `workingMinutes`, past days included: it is the configured week, and the range-level over-capacity check uses it. |

**Coverage of one task** — `scheduledMinutesOf(task, commitments)` is
`task.scheduledOutsideMinutes` plus Σ elapsed minutes of the commitments with
`kind === "work"` and `taskId === task.id`, executed or not. Coverage is _planned_ time,
so `occupiesTime` is deliberately not consulted here: a block that was already worked
is still time that was scheduled toward the estimate. The in-range blocks are summed
live from the commitment list so an optimistic block counts exactly once while its write
is in flight (`PlanningTask.scheduledOutsideMinutes` carries only what the range cannot
see). `remainingMinutesOf` is `max(0, estimatedMinutes − scheduled)`, and 0 when
`estimatedMinutes` is null or ≤ 0 — the same floor `coverageOf` applies in
`packages/core/src/tasks/coverage.ts`: an unestimated task has no remainder because there
is no denominator to invent one from.

**Why planned sums and available merges.** Two blocks at 10:00 are two claims on the
same hour. PLANNED is what the user has committed to, so it counts the hour twice; a
merged total would say "one hour" and hide the double booking the overlap warning is
about to name. AVAILABLE is what is left, and a minute cannot be freed twice, so the busy
list is coalesced (`busyIntervals` merges) before it is subtracted from the working
windows. The same pair of blocks therefore adds 120 to planned and removes 60 from
available, and that asymmetry is correct.

**Why available is today-based, not clock-based.** The week's available minutes count
today in full even at 16:00. The server renders this number and the client's first paint
must match it (docs/ARCHITECTURE.md §10, hydration), so it cannot depend on the hour.
The "~" the drawer prints before AVAILABLE is the acknowledgement that part of today may
already have gone. The one place the hour matters — whether a deadline can still be met —
is the insufficient-time warning, which takes `now` as an explicit input and, before
hydration, counts from the start of today instead.

### Conflict rules

`detectConflicts(input)` returns `PlanningWarning[]`. Every warning is information:
nothing here blocks, decides or ranks; the user may double-book a morning or plan twelve
hours on a Tuesday, and the drawer's job is to make sure that does not happen by accident.

**overlap.** For every pair of commitments that both `occupiesTime` and
`intervalsOverlap`, one warning. `first` is the earlier-starting block (tie: smaller id),
`date` is `localDateOf(second.startAt, tz)` — the day the overlap begins on, so a pair
across midnight is dated by the later block — and `overlapMinutes` is the elapsed length
of the intersection. Two events overlapping count too: that is a double booking. Touching
blocks do not overlap (intervals are half-open). Implemented as a sweep over the blocks
sorted by start: each block is compared only with those starting before it ends, so the
earlier block is always `first` and the scan is O(n log n + pairs).

**past-deadline.** Every `kind === "work"` commitment with `taskDueDate !== null`,
`taskCompletedAt === null`, and `localDateOf(startAt, tz) > taskDueDate`. `date` is the
block's local start date, resolved in the profile timezone, so a block at 23:30 on the
due date is not after it even though its UTC date is (Domain Rule 4). A completed task's
blocks are settled and say nothing; an executed block of an open task still warns — it
was scheduled after the deadline whether or not it was worked.

**over-capacity** — "scheduled workload substantially exceeds the configured working
window". Per day, when `plannedMinutes > workingMinutes + tolerance`, with

```
tolerance = max(OVER_CAPACITY_MIN_TOLERANCE_MINUTES, round(OVER_CAPACITY_TOLERANCE_RATIO × workingMinutes))
          = max(60, round(0.25 × workingMinutes))
```

(`overCapacityTolerance`, `exceedsWorkingWindow`). A quarter of the window, never less
than an hour: an eight-hour day warns above ten hours planned, a four-hour day above
five, and a day off (`workingMinutes === 0`) above sixty minutes planned — so a Saturday
errand does not trip it and a Saturday of work does. Exactly `working + tolerance` does
not warn; one minute more does. Because planned time sums by claim, two overlapping
eight-hour blocks on an eight-hour day are sixteen hours planned and do warn. Plus one
range-level warning (`date: null`) when the week's `plannedMinutes` exceeds the week's
`workingMinutes` by the same rule on the totals. Both may fire: a week can be within its
total with one day far over, and over in total with no single day over.

**insufficient-time.** For each task in `tasks` (deduplicated by id) with a remaining
estimate and a due date, `remainingMinutes = remainingMinutesOf(task, commitments)` and

```
availableMinutes = totalMinutes(subtractIntervals(
  clipIntervals(working intervals of every day from max(today, days[0]) to dueDate inclusive,
                { startAt: from, endAt: endOfDay(dueDate) }),
  busyIntervals(commitments)))
where from = input.now ?? startOfDay(today, tz)
```

The warning fires when `remainingMinutes > availableMinutes`; equal is enough. Tasks with
no remaining minutes (covered, over-scheduled, or unestimated) never warn.

_Why it is bounded by the range._ The check runs only when `days[0] ≤ dueDate ≤ last
day of days` and `dueDate ≥ today`. The engine holds the range's commitments and nothing
else. For a deadline after the last day it cannot see the free time between the range
and the deadline and would invent a shortage (no working days to count) or invent
capacity (working days with no blocks in them); for a deadline before the first day —
a future week being planned — the same is true of the days between today and the range.
In both cases it says nothing. Overdue tasks (`dueDate < today`) never produce this
warning: their state is the OVERDUE section of the drawer, not a conflict about the plan.

### Copy rules

`describeWarning(warning)` returns one sentence that states a fact about the schedule —
an amount, a date, a title — and never a verdict about the person (Domain Rule 7). No
"you", no "overbooked", "too much", "behind", "should", no adjective about the day.
Amounts use `formatDuration` (`"1h 30m"`); dates use one shape everywhere,
`formatLocalDate(d, "weekday")` + `formatLocalDate(d, "monthDay")` (`"Tue Sep 8"`).

| Kind                    | Sentence                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| overlap                 | `Team sync and History essay overlap by 30m on Tue Sep 8.`                                          |
| past-deadline           | `History essay is scheduled on Fri Sep 11, after its Thu Sep 10 deadline.`                          |
| over-capacity (day)     | `Tue Sep 8 has 9h 30m planned against 8h of working hours.`                                         |
| over-capacity (day off) | `Sat Sep 12 has 2h planned and no working hours configured.`                                        |
| over-capacity (range)   | `This range has 45h planned against 40h of working hours.`                                          |
| insufficient-time       | `History essay: 3h still to schedule, 1h 30m of working hours open before the Thu Sep 10 deadline.` |

A test asserts these exact strings and guards every sentence against the banned words
(you, lazy, unproductive, failure, behind, overcommitted, overbooked, bad, light day, busy
day, should, too much).

### Determinism

Same input, same list, same order, whatever order the commitments and tasks arrived in —
so a row keyed by `warningKey` never jumps as an optimistic block lands. `detectConflicts`
returns, in this order:

1. every `overlap`, sorted by `date`, then `first.id`, then `second.id`;
2. every `past-deadline`, by `date`, then `block.id`;
3. every `over-capacity`, days in `context.days` order, then the range-level one last;
4. every `insufficient-time`, by `dueDate`, then `taskId`.

`warningKey` is stable and distinct within a list: `overlap:<firstId>:<secondId>`,
`past-deadline:<blockId>`, `over-capacity:<date>` / `over-capacity:range`,
`insufficient-time:<taskId>`. Ids and dates are compared as strings; instants are
canonical ISO strings, so `<` orders them without epoch arithmetic.
