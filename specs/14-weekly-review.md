# Phase 14 — Weekly Review  *(post-MVP)*

**Model:** Opus 5 · **Effort:** high

## Objective

Close the loop. At the end of a week, show the user the difference between the week they
planned and the week they lived — and make sitting down to plan the next one feel like the
natural next step.

## Target

```
WEEK COMPLETE

Planned         22h 15m
Completed       18h 42m
████████████████░░  84%

FOCUS       12h 36m      ↑ 2h 14m
TASKS       38 / 44
HABITS      82%

ESTIMATION  You underestimated task time by 17%.
BEST DAY    Tuesday — 3h 12m focused

LEVEL UP!   17 → 18
```

## Requirements

### Availability

Show the review once a completed week contains enough data. Define the threshold; below it,
don't show a sad empty review.

### Sections

**Week summary** — planned work, completed work, focused hours, tasks, habit completion.

**Plan vs. actual** — estimated time against actual focus/work time. This is the section
that matters most; it's the raw material for future scheduling suggestions.

**Project distribution** — where time went.

**Scheduling** — scheduled blocks vs. completed blocks.

**Reflection** — three optional free-text prompts:

- What went well?
- What got in the way?
- What would you change next week?

Persisted. Optional means genuinely optional — never gate the review behind answering.

**Next week** — a "Plan Next Week" CTA that opens the Phase 5 planning drawer for the
upcoming week.

### Gamification

Apply earned weekly quest rewards here. Celebrate milestones subtly — this is one of the
few places a real celebration is warranted (Phase 8's rules still apply).

### Language

Factual only. Never score the week with moralizing terms — no "bad", "lazy", "failure",
"unproductive", "you fell behind" (Domain Rule 7).

"Completed 84% of planned time" is a fact. "You only completed 84%" is a judgment. The word
"only" is the entire difference; watch for it.

### Quality

Make it visually satisfying enough that finishing a week feels like it meant something.
This is the one screen where a bit of ceremony is earned.

Reuse Phase 10's aggregation utilities. Do not write a second set.

## Acceptance criteria

- [ ] The review appears only when the week has sufficient data
- [ ] All five sections render with correct numbers
- [ ] Plan-vs-actual comparison is correct and never conflates estimate with actual
- [ ] Week boundaries respect the user's week-start preference and timezone
- [ ] Reflection answers persist and are viewable later
- [ ] The review can be completed without answering any reflection prompt
- [ ] Weekly quest rewards apply exactly once per week
- [ ] "Plan Next Week" opens the planning drawer for the correct week
- [ ] No moralizing or judgmental language anywhere
- [ ] Past weeks' reviews remain accessible
- [ ] It reuses Phase 10's aggregation utilities
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: AI-generated reflection, sharing or export, a monthly/yearly review,
or emailed summaries.
