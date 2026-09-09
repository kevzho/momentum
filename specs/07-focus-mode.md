# Phase 7 — Focus Mode

**Model:** Opus 5 · **Effort:** high

## Objective

Add timed focus sessions that record **actual** time spent. This closes the product's core
loop: plan → do → measure → plan better.

## User stories

- I can start a focus session on a specific task in one click.
- I can start one from the task, from its calendar block, or from anywhere via the palette.
- The timer stays correct even if I switch tabs, sleep my laptop, or reload the page.
- When I finish, the time I actually spent is recorded against the task.
- I can see how much focused work I've done today and this week.

## Requirements

### Presets

25/5 · 50/10 · 90/20 · custom.

### Focus screen (`/focus`)

Task name · project · timer · progress ring · Pause · Finish Session · End Session.

Intentionally minimal. This screen exists to be looked at while not being looked at.

Launchable from: a task, a calendar task block, and the command palette (Phase 11).

**Do not fabricate capabilities.** No fake website blocking, no pretend "distraction
blocking" the app cannot actually enforce.

### Timer implementation — the part that's easy to get wrong

**Do not derive remaining time by decrementing a client counter once per second.**
Background tabs get throttled, sleeping machines stop firing intervals, and the timer drifts
or silently dies.

Instead: persist `started_at` and pause records; derive elapsed and remaining from actual
timestamps on every tick and on every visibility change. The interval drives *rendering*,
never *truth*.

Test explicitly: pause, resume, tab backgrounded for minutes, page reload mid-session,
and machine sleep.

### Session logic

Create a `focus_session` when the timer starts. Track planned duration, actual duration,
task, project, start/end, and interruptions (only when the user explicitly marks one).

On completion: update the task's actual time and award XP.

### XP — anti-farming

Base: roughly 1 XP per focused minute.

Bonuses: completed planned session +10% · linked to a priority task, small bonus ·
daily quest rewards handled separately (Phase 8).

Caps and rules, enforced **server-side** (Domain Rule 6):

- Per-session cap
- Per-day cap
- Sessions below a minimum duration earn nothing
- Award is idempotent — one session yields XP exactly once, regardless of retries
- Overlapping concurrent sessions do not double-count

Repeatedly starting and abandoning trivial sessions must not be profitable.

### Focus history

Today · this week · recent sessions. Total deep-work minutes, sessions completed, time by
project.

## Acceptance criteria

- [ ] All three presets and custom durations work
- [ ] A session can be started from a task, a calendar block, and (later) the palette
- [ ] Remaining time is derived from persisted timestamps, never from a decrementing counter
- [ ] The timer stays accurate after: tab backgrounded 5+ minutes, page reload, machine sleep
- [ ] Pause and resume are recorded and correctly excluded from actual time
- [ ] Finishing a session updates the linked task's actual minutes
- [ ] XP is calculated server-side; the client never sends an amount
- [ ] Per-session and per-day caps are enforced
- [ ] Sub-minimum sessions earn no XP
- [ ] Re-submitting the same completed session awards XP once
- [ ] Focus history shows today, this week, and recent sessions with per-project totals
- [ ] The UI claims no capability the app does not have
- [ ] Unit tests cover elapsed-time derivation, pause/resume math, cap enforcement, and
      idempotency
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: website/app blocking, ambient sound, native notifications (Phase 15),
menu-bar timer (Phase 15), or team/shared focus sessions.
