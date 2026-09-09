# Phase 6 — Habits

**Model:** Opus 5 · **Effort:** high

## Objective

Add habit tracking that feels like part of the planner rather than a separate app bolted on.
Habits compete for the same week as everything else.

## User stories

- I can define habits with different kinds of targets, not just "daily".
- I can see my week's habit progress at a glance.
- I can reserve calendar time for a habit and complete it from the calendar block.
- I can miss a day without losing everything I've built.

## Requirements

### Habit types

| Type | Example |
|---|---|
| Daily | Read 20 min/day |
| Specific weekdays | Practice piano 30 min, Mon/Wed/Fri |
| N times per week | Exercise 3×/week |
| Minutes per period | LeetCode 5 problems/week |

### Habit card

Name · target · weekly completion visualization · current consistency · XP reward ·
edit menu.

### Progress model — read this carefully

**Do not build a punitive streak system** (Domain Rule 7).

Track: current consistency · best streak · weekly success rate · monthly success rate.

A missed day reduces a *rate*. It never erases accumulated progress, never removes XP,
never resets a counter to zero with visual punishment. Best streak is a fact you may
display; it must not be the thing the user is afraid of losing.

No language anywhere calling the user inconsistent, lazy, or behind.

### Calendar integration

Habits may optionally define `preferred_start_time` and `estimated_duration`.

"Add to week" generates calendar blocks matching the habit's schedule for the current week.
Completing that block records the habit completion.

**Avoid duplicate completion records.** A habit completed on the calendar and then again on
the habits page must produce one record, not two. Enforce this in the database with a
constraint, not only in the UI (Domain Rule: `habit_completions` unique per habit per date
where the frequency type implies once-daily).

### Heatmap

A week heatmap on the habits page, and a longer-range view for a single habit.
Not color-only — completion state must be discernible without relying on hue.

### Recurrence

Use the recurrence strategy chosen in Phase 0. Do not invent a second one here.

## Acceptance criteria

- [ ] All four habit frequency types can be created and edited
- [ ] The habit card shows target, weekly progress, and consistency
- [ ] Completion can be recorded from the habits page
- [ ] A missed day reduces consistency and removes nothing
- [ ] No punitive copy or visuals exist anywhere in the habits surface
- [ ] "Add to week" generates correct calendar blocks for each frequency type
- [ ] Completing a habit calendar block records exactly one completion
- [ ] A database constraint prevents duplicate completions for the same habit and date
- [ ] Completion dates are stored as user-local calendar dates, not UTC timestamps
- [ ] The heatmap renders correctly and does not signal by color alone
- [ ] Archiving a habit preserves its history
- [ ] Unit tests cover recurrence expansion, completion recording, deduplication, and
      consistency math across week boundaries and DST
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: habit reminders/notifications, social or accountability features, habit
templates, or streak-freeze mechanics.
