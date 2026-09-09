# Phase 8 — Gamification

**Model:** Opus 5 · **Effort:** xhigh

## Objective

Build progression that makes sustained effort feel cumulative — without turning a
productivity tool into a cartoon. Momentum is a productivity tool first and a game second.

## User stories

- Finishing real work visibly moves a number I care about.
- I level up occasionally and it feels earned.
- I get a few small daily goals that are achievable within a normal day.
- Missing a day costs me nothing I've already earned.
- I can spend coins on cosmetics that don't affect functionality.

## Requirements

### Systems

XP · levels · coins · achievements · daily quests · weekly quests.

### XP sources

| Source | Award |
|---|---|
| Complete a task | ~10 base XP |
| Focus session | ~1 XP/minute, with caps (Phase 7) |
| Complete a habit | habit-specific reward |
| Complete a significant project task | additional reward |
| Complete a daily/weekly quest | bonus |

**All XP is computed server-side or in trusted database logic** (Domain Rule 6).
The client never submits an amount. Every award writes an `xp_event` row; the profile total
reconciles against that ledger.

**Idempotency:** completing → un-completing → re-completing a task must not mint XP twice.
Design the ledger's uniqueness constraints to enforce this, not the UI.

### Level curve

Smooth and increasing. Target feel:

```
Levels 1–5    quick
Levels 5–20   moderate
Levels 20+    progressively harder
```

Not exponentially absurd — a level 40 user should still level up sometimes.
**Document the formula** in `docs/ARCHITECTURE.md` with the reasoning and a table of the
first ~30 thresholds.

### Profile indicator

```
Level 14
████████░░  1,840 / 2,100 XP
```

Compact, in the top bar. Not a hero banner.

### Daily quests

3–4 per day, generated from deterministic templates. The same user and date always produce
the same quests.

Examples: complete 3 tasks · focus for 60 minutes · complete 2 habits · finish one
high-priority task.

Weekly: focus 5 hours · complete 15 tasks · complete habits on 5 days.

**Quests must never encourage unhealthy volumes of work.** Cap the targets. No "focus for 8
hours" quest, ever.

### Achievements

Seeded definitions, per-user unlocks. Starting set:

| Achievement | Condition |
|---|---|
| First Step | Complete your first task |
| Deep Work | Complete a 90-minute focus session |
| Consistency | Hit a habit's target five weeks |
| Early Bird | Complete ten scheduled blocks before noon |
| Planner | Schedule five tasks ahead of time |
| Project Finisher | Complete every remaining task in a project |

### Cosmetics

Coins buy **cosmetics only** — never functionality, never time, never advantages.
Profile frames · themes · calendar block styles · avatars/icons.

Build the architecture for cosmetics; implement one minimal first collection.

### Feedback

- Completing a meaningful task: a subtle XP animation and progress movement
- **No confetti for every checkbox**
- Reserve real celebration for level up, achievement unlock, and weekly goal completion —
  brief, skippable, and respecting `prefers-reduced-motion`
- Occasional achievement toast, never a queue of them

### Never

No XP loss. No streak destruction. No punishment visuals. No moralizing copy.
(Domain Rule 7.)

## Acceptance criteria

- [ ] XP is awarded from tasks, focus sessions, habits, and quests
- [ ] Every award is computed server-side and recorded as an `xp_event`
- [ ] The client cannot submit an XP amount by any path
- [ ] Complete → uncomplete → recomplete awards XP exactly once
- [ ] Profile XP reconciles with the sum of the ledger
- [ ] The level curve is implemented, documented, and produces the intended pacing
- [ ] The top-bar indicator shows level and progress to the next level
- [ ] 3–4 daily quests generate deterministically per user per date
- [ ] Weekly quests generate and track correctly
- [ ] No quest target encourages unhealthy work volume
- [ ] All six starter achievements unlock under the correct conditions and never re-unlock
- [ ] Coins are earned and spendable on cosmetics only
- [ ] At least one cosmetic collection is implemented and applies visibly
- [ ] Celebration is reserved for level up, achievement, and weekly goal
- [ ] `prefers-reduced-motion` suppresses celebration animation
- [ ] No XP is ever lost and no streak is ever destroyed
- [ ] Unit tests cover XP calculation, level thresholds, idempotency, cap enforcement, and
      quest generation determinism
- [ ] Tests specifically attempt XP exploits and prove they fail
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: leaderboards, social features, pets/avatars with stats, purchasable
functionality, real-money purchases, or a battle/boss combat system.
