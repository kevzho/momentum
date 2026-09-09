# Momentum — Complete Prompt Sequence

Every prompt for the whole build, in order. Copy the block for the phase you're on.

`docs/RUNBOOK.md` has the strategy behind these — model allocation reasoning, what to do
when a phase goes sideways. This file is just the prompts.

## How to use these

For each phase: **start a fresh context** → set model and effort → paste the session
message → paste the `/goal` → let it run → verify `docs/ROADMAP.md` was updated → commit.

Three rules:

1. **Never paste a spec into chat.** Pasted text sits in context forever; a referenced file
   gets read when needed and dropped when not. Point at the path.
2. **The spec is *what to build*. The goal is *how we know it's done*.** Specs stay long,
   goals stay short. Don't put requirements in `/goal`.
3. **One phase per context.** A 1M window is room, not a strategy.

When you enable ultracode, the fan-out constraint is already in `AGENTS.md`, but it's
included in-session below as cheap insurance.

---
---

# PHASE 0 — Foundation & Architecture

```
/model fable-5.1
/effort xhigh
```

```
Read CLAUDE.md, AGENTS.md, docs/PRODUCT.md, docs/DOMAIN_RULES.md,
docs/DESIGN_SYSTEM.md, and specs/00-foundation.md.

Also skim every file in specs/ so the architecture accounts for all planned phases.

Implement Phase 0. Do not implement application features.

Resolve architectural contradictions now rather than letting later phases inherit them.
```

```
/goal Phase 0 is complete when docs/ARCHITECTURE.md and docs/DATABASE.md contain no
remaining OPEN or SKELETON markers, every decision listed in the specs/00-foundation.md
acceptance criteria is documented with a rationale and rejected alternatives,
docs/ROADMAP.md records the frozen architectural decisions, and the repository scaffold
installs and runs pnpm dev, pnpm typecheck, and pnpm lint successfully. No application
features are implemented. Stop after 12 turns if blocked and explain the blocker.
```

---

# PHASE 1 — App Shell & Design System

```
/model opus-5
/effort high
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, docs/DESIGN_SYSTEM.md, and specs/01-app-shell.md.

Implement Phase 1 only. Inspect the existing scaffold before modifying it.
Use the acceptance criteria in the spec as the definition of done.
```

```
/goal Phase 1 satisfies every acceptance criterion in specs/01-app-shell.md: all seven
routes render with realistic placeholders, the sidebar collapses with persisted state,
light and dark themes both work without a flash of wrong theme, mobile has no horizontal
overflow at 375px, every interactive element is keyboard reachable with a visible focus
ring, and design tokens are used with no arbitrary hex or spacing values in components.
pnpm typecheck exits 0, pnpm lint exits 0, and pnpm build succeeds. Do not implement
Phase 2. Stop after 10 turns if blocked.
```

---

# PHASE 2 — Database & Auth

```
/model opus-5
/effort xhigh
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, docs/DATABASE.md, docs/DOMAIN_RULES.md,
and specs/02-database-auth.md.

Implement Phase 2 only. Implement the schema designed in Phase 0 rather than redesigning
it. All schema changes ship as migrations — nothing configured only in the dashboard.
```

```
/goal Phase 2 satisfies every acceptance criterion in specs/02-database-auth.md:
migrations apply cleanly to an empty database, signup/login/logout/password reset all
work, a profile row with a valid IANA timezone is created on signup, RLS is enabled with
policies on every user-owned table, automated tests prove a second user cannot read or
write the first user's rows, generated types are checked in, no Supabase query exists
inside a UI component, and seed data loads covering multi-block tasks, overlapping events,
every habit frequency type, and historical focus sessions. docs/DATABASE.md matches the
migrations. pnpm typecheck, pnpm lint, and pnpm test all exit 0. Do not implement Phase 3.
Stop after 12 turns if blocked.
```

---

# PHASE 3 — Weekly Calendar  ← first ultracode phase

```
/model opus-5
/effort ultracode
```

```
Read CLAUDE.md, AGENTS.md, docs/ARCHITECTURE.md, docs/DOMAIN_RULES.md,
and specs/03-weekly-calendar.md.

Use Ultracode to implement Phase 3. Parallelize only where ownership separates cleanly —
grid and block rendering, drag/keyboard interaction logic, data layer and mutations, and
the Plan side panel are separable lanes. The lead owns the shared time and coordinate
utilities; workers consume them and do not edit them.

Use no more parallel agents than materially improve the task. Prefer 3-6 focused workers
over broad fan-out. Do not spawn agents for trivial mechanical changes. Each worker gets a
clear responsibility and non-overlapping file ownership. The lead owns integration and
final verification.

Do not implement later phases.
```

```
/goal Phase 3 satisfies every acceptance criterion in specs/03-weekly-calendar.md: events
can be created by click and by drag, moved across times and days, and resized from both
edges with 15-minute snapping; unscheduled tasks drag from the Plan panel onto the grid
and use estimated_minutes for initial block length; the block stays linked to its task;
all changes persist through reload; failed mutations roll back and surface the error;
every drag action has a working keyboard equivalent announced to screen readers;
overlapping blocks render side by side and stay readable; Escape cancels an in-progress
drag; and unit tests cover date calculations, week boundaries, snapping math, pixel-to-time
mapping, and timezone-sensitive cases including DST and midnight-crossing. pnpm typecheck,
pnpm lint, and pnpm test all exit 0. Do not implement Phase 4. Stop after 15 turns if
blocked.
```

---

# PHASE 4 — Task Manager

```
/model opus-5
/effort xhigh
```

```
Read CLAUDE.md, docs/DOMAIN_RULES.md, docs/DATABASE.md, and specs/04-task-manager.md.

Implement Phase 4 only.

Pay particular attention to Domain Rule 2. A task must be able to own multiple work
blocks. If the current schema only permits one scheduled block per task, refactor it
properly and migrate existing data — do not force the UX around the limitation.
```

```
/goal Phase 4 satisfies every acceptance criterion in specs/04-task-manager.md: a task
owns multiple work blocks with any prior single-block modeling migrated and existing data
preserved; due date and scheduled time are distinct in the schema, API, and UI; all six
views filter correctly; Quick Add creates a task from title alone in two interactions from
anywhere in-app; the detail side sheet edits and persists every field; scheduled-versus-
estimated coverage is visible; keyboard navigation covers move, open, complete, and select;
optimistic completion rolls back on failure; and unit tests cover filtering, sorting,
coverage math, and the work-block migration. pnpm typecheck, pnpm lint, and pnpm test all
exit 0. Do not implement Phase 5. Stop after 15 turns if blocked.
```

---

# PHASE 5 — Week Planning & Find Time

```
/model fable-5.1
/effort ultracode
```

```
Read CLAUDE.md, AGENTS.md, docs/ARCHITECTURE.md, docs/DOMAIN_RULES.md,
and specs/05-week-planning.md.

Use Ultracode to implement Phase 5. The Find Time engine is the product's eventual moat —
build it as deterministic, pure, unit-tested scheduling logic with no LLM and no network
calls in the path, and document the ranking algorithm.

Separable lanes: the planning drawer UI, the capacity and conflict-detection logic, and
the Find Time engine with its tests.

Use no more parallel agents than materially improve the task. Prefer 3-6 focused workers
over broad fan-out. Each worker gets non-overlapping file ownership. The lead owns
integration and final verification.

If Phase 6 is not yet done, build without the HABITS section and record that in
docs/ROADMAP.md.

Do not implement later phases.
```

```
/goal Phase 5 satisfies every acceptance criterion in specs/05-week-planning.md: the
planning drawer opens beside the calendar without hiding it; items drag into the week and
persist; planned, available, and unscheduled totals update live during planning; per-day
workload bars are correct; overlap, past-deadline, over-capacity, and insufficient-time
warnings all fire and none of them block the action; no copy anywhere characterizes or
judges the user; Find Time returns ranked candidate slots with human-readable
explanations and one-click scheduling; the engine is deterministic and implemented as pure
functions; unit tests cover the ranking rules plus fully-booked weeks, tasks longer than
any gap, past deadlines, and DST transitions; the algorithm is documented; and working
hours and preferred focus windows are configurable. pnpm typecheck, pnpm lint, and
pnpm test all exit 0. Stop after 15 turns if blocked.
```

---

# INTEGRATION AUDIT A — run after Phase 5

```
/model fable-5.1
/effort ultracode
```

```
Audit Phases 0-5 as one system, not as separate features.

Find architectural inconsistencies, data-model mistakes, incorrect time semantics, race
conditions, security gaps, scheduling edge cases, and UX state inconsistencies. Fix
verified problems. Do not add new product functionality.

Pay specific attention to the seams: task to work block, work block to calendar event,
estimate to actual, and every place a date boundary is computed.

Use no more parallel agents than materially improve the task. Prefer 3-6 focused workers
with non-overlapping ownership. The lead owns integration and verification.

Record findings in docs/ROADMAP.md under Current known issues, and any semantic
clarifications in docs/DOMAIN_RULES.md.
```

```
/goal The audit is complete when every confirmed defect is either fixed or recorded in
docs/ROADMAP.md with a severity, pnpm typecheck, pnpm lint, pnpm test, and pnpm build all
exit 0, and a written report lists FIXED, REMAINING, and TECHNICAL DEBT. No new features
were added. Stop after 15 turns.
```

---

# PHASE 6 — Habits

```
/model opus-5
/effort high
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, docs/DOMAIN_RULES.md, and specs/06-habits.md.

Implement Phase 6 only. Use the recurrence strategy chosen in Phase 0 — do not invent a
second one. Habits must feel like part of the planner, not a separate app.

Domain Rule 7 is binding here: no punitive streak system, no XP loss, no judgmental copy.
```

```
/goal Phase 6 satisfies every acceptance criterion in specs/06-habits.md: all four habit
frequency types can be created and edited; a missed day reduces consistency and removes
nothing; no punitive copy or visuals exist anywhere; "Add to week" generates correct
calendar blocks for each frequency type; completing a habit calendar block records exactly
one completion with a database constraint preventing duplicates; completion dates store as
user-local calendar dates rather than UTC timestamps; the heatmap does not signal by color
alone; archiving preserves history; and unit tests cover recurrence expansion,
deduplication, and consistency math across week boundaries and DST. pnpm typecheck,
pnpm lint, and pnpm test all exit 0. Do not implement Phase 7. Stop after 12 turns if
blocked.
```

---

# PHASE 7 — Focus Mode

```
/model opus-5
/effort high
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, docs/DOMAIN_RULES.md, and specs/07-focus-mode.md.

Implement Phase 7 only.

The timer must derive remaining time from persisted timestamps, not from a decrementing
client counter — background tabs get throttled and sleeping machines stop firing intervals.
The interval drives rendering, never truth.

Do not fabricate capabilities the app does not have, such as website blocking.
```

```
/goal Phase 7 satisfies every acceptance criterion in specs/07-focus-mode.md: all presets
and custom durations work; sessions launch from a task and from a calendar block; remaining
time derives from persisted timestamps and stays accurate after a tab is backgrounded five
or more minutes, after a page reload, and after machine sleep; pause and resume are
recorded and excluded from actual time; finishing updates the linked task's actual minutes;
XP is calculated server-side with per-session and per-day caps, no award for sub-minimum
sessions, and idempotency such that re-submitting a completed session awards once; focus
history shows today, this week, and per-project totals; the UI claims no capability the app
lacks; and unit tests cover elapsed-time derivation, pause/resume math, cap enforcement,
and idempotency. pnpm typecheck, pnpm lint, and pnpm test all exit 0. Do not implement
Phase 8. Stop after 12 turns if blocked.
```

---

# PHASE 8 — Gamification

```
/model opus-5
/effort xhigh
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, docs/DOMAIN_RULES.md, and specs/08-gamification.md.

Implement Phase 8 only.

All XP is computed server-side or in trusted database logic. The client never submits an
amount. Awards must be idempotent — complete, uncomplete, recomplete must not mint XP twice.

Momentum is a productivity tool first and a game second. No XP loss, no streak destruction,
no cartoon RPG chrome, no confetti for every checkbox.
```

```
/goal Phase 8 satisfies every acceptance criterion in specs/08-gamification.md: XP is
awarded from tasks, focus sessions, habits, and quests, always computed server-side and
recorded as an xp_event, with no client path able to submit an amount; complete-uncomplete-
recomplete awards exactly once; profile XP reconciles with the ledger sum; the level curve
is implemented and documented with its first thirty thresholds; 3-4 daily quests generate
deterministically per user per date; no quest target encourages unhealthy work volume; all
six starter achievements unlock under correct conditions and never re-unlock; coins buy
cosmetics only and one collection is implemented; celebration is reserved for level up,
achievement, and weekly goal, and is suppressed under prefers-reduced-motion; no XP is ever
lost; and tests specifically attempt XP exploits and prove they fail. pnpm typecheck,
pnpm lint, and pnpm test all exit 0. Do not implement Phase 9. Stop after 15 turns if
blocked.
```

---

# PHASE 9 — Today Page

```
/model opus-5
/effort high
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, docs/DESIGN_SYSTEM.md, and specs/09-today.md.

Implement Phase 9 only.

This is the primary execution surface, not a dashboard. It answers exactly four questions:
what am I doing today, what should I do next, how am I progressing today, is anything at
risk. If an element does not answer one of those, it does not go on the page.

Mobile is not an afterthought here — this is the screen people open on their phone.
```

```
/goal Phase 9 satisfies every acceptance criterion in specs/09-today.md: Next Up correctly
identifies the next incomplete scheduled item by current time and handles nothing-
scheduled, everything-complete, and mid-block states; Start Focus, Complete, and Reschedule
all work from it; the timeline shows events, task blocks, and habit blocks chronologically
with past, current, and future visually distinct; habits complete inline; At Risk renders
only when something is at risk and its copy is factual and non-judgmental; "today" resolves
in the user's profile timezone and rolls over correctly at local midnight including across
a DST boundary; the page is fully usable and polished at 375px width; every action is
keyboard accessible; and optimistic updates roll back on failure. pnpm typecheck, pnpm
lint, and pnpm test all exit 0. Do not implement Phase 10. Stop after 12 turns if blocked.
```

---

# PHASE 10 — Analytics

```
/model opus-5
/effort xhigh
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, docs/DOMAIN_RULES.md, and specs/10-analytics.md.

Implement Phase 10 only.

Domain Rule 8 is binding: insights report correlation, never causation, and never
characterize the user. Gate every insight behind a minimum sample size and suppress it
below the threshold rather than showing noise.

Build the aggregation utilities as a separate tested layer — Phase 14 reuses them.
```

```
/goal Phase 10 satisfies every acceptance criterion in specs/10-analytics.md: all three
time windows work; all six visualizations render correct data and stay legible in light and
dark themes with accessible text alternatives; planned-versus-actual comparison never
conflates the two values; insights appear only above their sample-size threshold and make
no causal claims; no copy characterizes or judges the user; new accounts see a designed
empty state rather than broken charts; day, week, and hour bucketing uses the user's
timezone and is correct across DST and week boundaries; and aggregation utilities are
separate from components and unit tested. pnpm typecheck, pnpm lint, and pnpm test all
exit 0. Do not implement Phase 11. Stop after 12 turns if blocked.
```

---

# PHASE 11 — Command Palette, Quick Add & NL Parsing

```
/model opus-5
/effort high
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, and specs/11-command-palette.md.

Implement Phase 11 only.

Natural-language parsing is deterministic — no LLM. An LLM here would be slower,
non-deterministic, and worse at what users actually type.

Never discard unrecognized text: anything unparsed stays in the title. Typing must remain
fluid even when parsing fails.

Build the palette around a typed command registry so future features register commands
without touching palette internals.
```

```
/goal Phase 11 satisfies every acceptance criterion in specs/11-command-palette.md: the
palette opens from every route and all navigation, creation, and action commands work;
commands come from a typed registry requiring no palette-internals change to extend; fuzzy
search matches commands, tasks, and projects; focus is trapped while open and restored on
close, with results announced to assistive technology; a task can be captured in two
interactions from any screen; all four parser categories work across the spec's example
inputs; parsed values render as removable chips before creation; unrecognized text is
preserved in the title and never dropped; weekday and relative dates resolve in the user's
timezone; and unit tests cover parser edge cases including metadata-like text that is not
metadata, conflicting metadata, unicode, empty input, and very long input. pnpm typecheck,
pnpm lint, and pnpm test all exit 0. Do not implement Phase 12. Stop after 12 turns if
blocked.
```

---

# PHASE 12 — PWA & Installability

```
/model opus-5
/effort high
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, and specs/12-pwa.md.

Implement Phase 12 only.

Get the service worker update path right — a stale worker serving an old bundle is worse
than no service worker at all.

Be honest about offline scope. Full offline editing is out of scope; offline mutations must
fail visibly and never be silently swallowed or optimistically applied and then lost.
```

```
/goal Phase 12 satisfies every acceptance criterion in specs/12-pwa.md: the manifest
validates and the app installs from Chrome and Safari; icons render correctly at every size
including maskable; the installed app opens standalone with no browser chrome; the app
launches offline with a designed offline state; the service worker updates reliably with no
stale bundle after a deploy; offline mutations fail visibly and are never silently lost;
theme color matches the active theme; iOS safe areas are handled; Lighthouse PWA
installability checks pass; and no claim of offline capability the app lacks appears
anywhere. pnpm typecheck, pnpm lint, and pnpm build all exit 0. Record per-browser
limitations in docs/ROADMAP.md. Do not implement Phase 13. Stop after 10 turns if blocked.
```

---

# SECURITY AUDIT — run before Phase 13

```
/model fable-5.1
/effort ultracode
```

```
Perform a security audit of the entire application.

Audit: Supabase RLS coverage and correctness on every table including join and progress
tables, mutation authorization on every path, server-side XP integrity and farm resistance,
secrets exposed in the client bundle, unsafe user input handling, and any path by which one
user's data could reach another.

Write RLS tests that attempt cross-user reads and writes and prove they fail. Not "we added
policies" — proof.

Use no more parallel agents than materially improve the task. Prefer 3-6 focused workers
with non-overlapping ownership.

Fix confirmed issues. Do not add features.
```

```
/goal The security audit is complete when every user-owned table has RLS enabled with a
verified policy, automated tests prove cross-user reads and writes are denied, no XP path
accepts a client-supplied amount, no secrets are exposed to the client bundle, all user
input handling is safe, every confirmed issue is fixed, and pnpm typecheck, pnpm lint, and
pnpm test all exit 0. Produce a findings report. Stop after 12 turns.
```

---

# PHASE 13 — Final Product-Quality Audit

```
/model fable-5.1
/effort ultracode
```

```
Read CLAUDE.md, AGENTS.md, and specs/13-final-audit.md.

Do not immediately change code. First inspect every one of the 18 workflows listed in the
spec across correctness, persistence, loading states, error states, empty states,
optimistic updates and rollback, keyboard navigation, accessibility, mobile usability,
responsiveness, visual consistency, and timezone behavior.

Produce a prioritized P0/P1/P2 findings list. Then fix in priority order.

In the design audit, simplify rather than adding decoration — the correct fix for most
findings is removal.

Use no more parallel agents than materially improve the task. Prefer 3-6 focused workers
with non-overlapping ownership. The lead owns integration and verification.
```

```
/goal The final audit is complete when all 18 workflows have been inspected with findings
recorded before any fixes, every P0 and P1 finding is fixed, P2 findings are fixed or
recorded in docs/ROADMAP.md, design audit items are addressed by simplification, RLS is
verified with automated cross-user access tests, no secrets appear in the client bundle, no
XP path accepts a client-supplied amount, and pnpm lint, pnpm typecheck, pnpm test,
integration tests, and pnpm build all exit 0. docs/ reflects the final state of the system.
Produce a report listing FIXED, REMAINING ISSUES, TECHNICAL DEBT, and NEXT RECOMMENDED
FEATURES. Do not declare completion while any check fails. Stop after 20 turns.
```

---
---

# POST-MVP

# PHASE 14 — Weekly Review

```
/model opus-5
/effort high
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, docs/DOMAIN_RULES.md, and specs/14-weekly-review.md.

Implement Phase 14 only. Reuse Phase 10's aggregation utilities — do not write a second set.

Language is factual only. "Completed 84% of planned time" is a fact; "you only completed
84%" is a judgment. Watch for the word "only".
```

```
/goal Phase 14 satisfies every acceptance criterion in specs/14-weekly-review.md: the
review appears only when the week has sufficient data; all five sections render correct
numbers; plan-versus-actual never conflates estimate with actual; week boundaries respect
the user's week-start preference and timezone; reflection answers persist and the review
can be completed without answering any prompt; weekly quest rewards apply exactly once per
week; "Plan Next Week" opens the planning drawer for the correct week; no moralizing
language appears anywhere; past reviews remain accessible; and it reuses Phase 10's
aggregation utilities. pnpm typecheck, pnpm lint, and pnpm test all exit 0. Stop after 12
turns if blocked.
```

---

# PHASE 15 — Desktop (Tauri) & macOS Distribution

**Do not start this until the web app has real users.** Ship Phases 0-13 and get 10-30
people genuinely using the weekly planner first.

```
/model opus-5
/effort xhigh
```

```
Read CLAUDE.md, docs/ARCHITECTURE.md, and specs/15-desktop-tauri.md.

Implement Phase 15 only.

The web application is canonical. The desktop app wraps and extends the shared application
— it never becomes an independent implementation. Shared code must never branch on
platform; it calls a capability whose implementation differs.

Prioritize the menu-bar focus timer and the global Quick Add shortcut. Those are the two
features that make the desktop app meaningfully better than a browser tab.

Verify all Apple signing, notarization, and architecture-support requirements against
current Apple documentation rather than trusting the spec — those requirements change.

Credential handling is non-negotiable: no Apple Account credentials in the repository, CI,
or any config file. The signing step must be one clearly-documented action the account
holder performs with credentials they control. Automate everything up to that step.
```

```
/goal Phase 15 satisfies every acceptance criterion in specs/15-desktop-tauri.md: the
desktop app runs the shared frontend with no forked feature implementations and no shared
code branching on platform; the capabilities layer exists with web no-op and desktop
implementations; the menu-bar focus timer shows live remaining time with pause and finish;
global Quick Add works system-wide; native notifications fire for upcoming blocks; the dock
badge reflects remaining tasks; a universal binary builds or the arm64-only decision is
documented with its reason; the app is signed with Developer ID and hardened runtime,
notarized, and stapled; Gatekeeper accepts the DMG on a clean machine; auto-update works
end to end; docs/RELEASE.md documents the process including the account-holder signing
step; and no Apple Account credentials appear anywhere in the repository or CI. pnpm
typecheck, pnpm lint, pnpm test, and pnpm build all exit 0 for both apps. Stop after 15
turns if blocked.
```

---
---

# BETWEEN EVERY PHASE

1. Confirm `docs/ROADMAP.md` was updated — status, decisions, known issues, session log.
2. Commit: `git commit -m "implement phase N: <name>"`. One phase, one commit.
3. Start a **new context** for the next phase.

# WHEN A PHASE GOES SIDEWAYS

- **Wrong architecture chosen** — stop, fix `docs/ARCHITECTURE.md` first, then re-run the
  phase. Do not patch around a bad decision.
- **Spec turned out wrong** — update the spec file, then re-run. A stale contract produces
  stale work.
- **Model is thrashing** — usually missing context, not missing capability. Check the
  session message pointed at the right files.
- **Ultracode burning capacity** — drop to `/effort xhigh` and decompose manually.
