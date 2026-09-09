# Phase 5 — Week Planning & Find Time

**Model:** Fable 5.1 or Opus 5 · **Effort:** ultracode

## Objective

Turn the calendar from a place where time is displayed into a place where a week is
deliberately planned. This is where the product stops being a nicer todo list.

The Find Time engine built here is the foundation of the eventual moat. Build it as
transparent, deterministic, tested scheduling logic. **No LLM in this path.**

## User stories

- I can open a planning drawer and see everything competing for my week in one place.
- I can drag those items into the week and watch my remaining capacity change.
- I can see how loaded each day is without being told whether that's good or bad.
- I'm warned when I've scheduled work after its deadline, or double-booked myself.
- I can ask for a suggested time for a task and understand why it was suggested.

## Requirements

### Plan My Week drawer

Triggered from the calendar; the calendar stays visible beside it.

Sections: **OVERDUE** · **DUE THIS WEEK** · **UNSCHEDULED** · **HABITS** ·
**WEEKLY GOALS**.

Each item shows name, due date, priority, estimated duration, project. Items drag into the
week. (If Phase 6 isn't done, omit HABITS and note it in `docs/ROADMAP.md`.)

### Capacity display

```
PLANNED            18h 35m
AVAILABLE          ~12h 10m
UNSCHEDULED WORK    4h 20m
```

Available capacity derives from the user's configured working window minus existing
commitments. If working hours aren't configured yet, add the setting.

Per-day workload:

```
Mon ███████  6.5h
Tue ████     3.4h
Wed █████    4.7h
```

**Neutral information only.** Never characterize the user or their week — no "light day",
no "you're overcommitted", no productivity scoring (Domain Rule 7).

### Conflict detection

Warn when: blocks overlap · scheduled work falls after a task's due date · scheduled
workload substantially exceeds the configured working window · insufficient time remains
before a deadline.

Warnings are **informative, never blocking.** The user is allowed to overcommit; they just
shouldn't do it by accident.

### Find Time

For a task with an estimate and optionally a due date, find and rank candidate slots.

Ranking criteria, in order:

1. Before the deadline
2. Within configured working hours
3. Minimal conflicts
4. Avoids fragmenting the schedule into unusable gaps
5. Respects preferred focus windows, if configured

The system explains its recommendation in plain language:

> "Wednesday 4:00–5:00 PM — 2-hour open window before Thursday deadline."

One-click Schedule accepts a suggestion. Offer more than one candidate so the user chooses.

**Requirements on the implementation:**

- Pure functions over an explicit input (existing blocks, working hours, task, preferences)
- Deterministic — same input, same output, always
- Unit tested against hand-constructed scenarios including the awkward ones: fully booked
  weeks, tasks longer than any available gap, deadlines in the past, DST transitions
- Documented in `docs/ARCHITECTURE.md` (or a dedicated `docs/SCHEDULING.md`), including
  the ranking rules and their rationale
- No network calls, no model calls

## Acceptance criteria

- [ ] The planning drawer opens beside the calendar without hiding it
- [ ] All available sections populate correctly
- [ ] Items drag from the drawer into the week and persist
- [ ] Planned / available / unscheduled totals are correct and update live during planning
- [ ] Per-day workload bars are correct
- [ ] No copy anywhere characterizes the user or judges their week
- [ ] Overlap, past-deadline, over-capacity, and insufficient-time warnings all fire correctly
- [ ] Warnings never block the action
- [ ] Find Time returns ranked candidate slots with human-readable explanations
- [ ] One-click Schedule creates the work block
- [ ] Find Time is deterministic and implemented as pure functions
- [ ] Unit tests cover the ranking rules and the edge cases listed above
- [ ] The algorithm is documented
- [ ] Working hours and preferred focus windows are configurable in settings
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: AI/LLM scheduling of any kind, automatic rescheduling, historical
estimate calibration (that needs Phase 10's data), multi-week planning, or auto-splitting a
task into multiple blocks (suggest a slot; the user decides).
