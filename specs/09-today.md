# Phase 9 — Today Page

**Model:** Opus 5 · **Effort:** high

## Objective

Build the primary execution surface. The calendar is where the week is planned; `/today` is
where it's lived. This is the second-most-important screen in the product.

**It is not a dashboard.** It answers exactly four questions:

1. What am I doing today?
2. What should I do next?
3. How am I progressing today?
4. Is anything at risk?

If a proposed element doesn't answer one of those, it doesn't go on the page.

## Target layout

```
GOOD MORNING, KEVIN
Saturday, September 5

Level 18                    72%
███████████████░░░░

TODAY
─────────────────────────
9:00   AP Chemistry
       ✓ Complete lab analysis
11:00  Research
       ○ Analyze GVAE benchmarks
2:00   Focus
       ○ College essay · 60 min

NEXT UP
┌────────────────────────┐
│ Analyze GVAE benchmarks│
│ Research · 50 min      │
│      ▶ Start Focus     │
└────────────────────────┘

HABITS        3/5          DAILY QUESTS   2/3
✓ Piano                    ✓ Focus 60 min
✓ Reading                  ✓ Complete 3 tasks
○ Exercise                 ○ Finish high priority task
✓ LeetCode
○ Journal
```

## Requirements

### Header
Greeting · date · current level and XP progress.

### Next Up
The next incomplete scheduled item based on the current time. Shows task, project,
scheduled time, estimated duration.

Primary CTA: **Start Focus**. Secondary: Complete, Reschedule.

This is the most important component on the page — it should always have a sensible answer,
including "nothing scheduled — here's what's due soonest" and a genuinely pleasant
everything-done state.

### Today timeline
Compact vertical timeline of calendar events, scheduled task blocks, and habit blocks, in
chronological order. Past items visually settled, current item distinguished.

### Tasks
Unscheduled tasks due today, below the timeline.

### Habits
Compact completion row, completable inline.

### Quests
Daily quests and XP progress. Compact.

### At Risk
**Only rendered when there is something to say.** An empty At Risk section must not appear.

Shows: overdue tasks · a task due soon without enough scheduled time · a calendar conflict.

Concise and factual. Never alarming, never moralizing (Domain Rule 7).

### Quality

This page and `/calendar` are what people judge the product on. It must be exceptionally
polished on **both desktop and mobile** — mobile is not an afterthought here; this is the
screen people open on their phone between classes.

Delightful but restrained interactions. Everything completable inline without navigating away.

## Acceptance criteria

- [ ] Next Up correctly identifies the next incomplete scheduled item by current time
- [ ] Next Up handles: nothing scheduled, everything complete, and mid-block states
- [ ] Start Focus launches a session for that task
- [ ] Complete and Reschedule both work from Next Up
- [ ] The timeline shows events, task blocks, and habit blocks in chronological order
- [ ] Past, current, and future items are visually distinct
- [ ] Unscheduled tasks due today appear
- [ ] Habits can be completed inline and update immediately
- [ ] Daily quests and XP progress display correctly
- [ ] At Risk renders only when there is something at risk
- [ ] At Risk copy is factual and non-judgmental
- [ ] "Today" resolves in the user's profile timezone, and rolls over correctly at local
      midnight (test across a DST boundary)
- [ ] The page is fully usable and polished at 375px width
- [ ] Every action is keyboard accessible
- [ ] All optimistic updates roll back on failure
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: analytics charts (Phase 10), a weekly review (Phase 14), AI suggestions,
a news/quote widget, or any generic dashboard stat tiles.
