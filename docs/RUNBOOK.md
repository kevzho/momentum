# Momentum — Build Runbook

The strategy behind the build. **The prompts themselves live in
[`docs/PROMPTS.md`](PROMPTS.md)** — this file explains why they're arranged the way they are.

---

## The pattern

```
fresh context
   ↓
/model  +  /effort
   ↓
short session message  (points at files — never paste the spec)
   ↓
/goal   (measurable definition of done)
   ↓
implement → test → verify
   ↓
update docs/ROADMAP.md  →  commit
   ↓
new context for the next phase
```

**Three rules that matter more than the rest:**

1. **Never paste a spec into chat.** Pasted text sits in context forever; a referenced file
   gets read when needed and dropped when not. Point at the path.
2. **The spec is *what to build*. The goal is *how we know it's done*.** Keep specs long
   and goals short. Don't put requirements in `/goal`.
3. **One phase per context.** Don't carry architecture + phase 1 + 47 debugging messages +
   phase 3 in a single conversation. A 1M context window is room, not a strategy.

---

## Model allocation

| Phase | Model | Effort |
|---|---|---|
| 0 Foundation | Fable 5.1 | xhigh |
| 1 App shell | Opus 5 | high |
| 2 Database | Opus 5 | xhigh |
| 3 Weekly calendar | Opus 5 | **ultracode** |
| 4 Tasks | Opus 5 | xhigh |
| 5 Week planning | Fable 5.1 | **ultracode** |
| — Integration audit A | Fable 5.1 | **ultracode** |
| 6 Habits | Opus 5 | high |
| 7 Focus | Opus 5 | high |
| 8 Gamification | Opus 5 | xhigh |
| 9 Today | Opus 5 | high |
| 10 Analytics | Opus 5 | xhigh |
| 11 Command palette | Opus 5 | high |
| 12 PWA | Opus 5 | high |
| — Security audit | Fable 5.1 | **ultracode** |
| 13 Final audit | Fable 5.1 | **ultracode** |
| 14 Weekly review | Opus 5 | high |
| 15 Desktop / Tauri | Opus 5 | xhigh |

Roughly 75–85% Opus 5. Fable 5.1 is concentrated in five places where long-horizon,
whole-codebase reasoning actually pays for itself:

- **Phase 0** — because changing `Task → CalendarEvent` into `Task → WorkBlock[]` after
  30,000 lines exist is miserable. Strongest reasoning goes at the front.
- **Phase 5** — the Find Time engine is the eventual moat.
- **Integration audit A** — after Phase 5 the entity graph gets genuinely tangled:
  Task ↔ WorkBlock ↔ Habit ↔ FocusSession ↔ Gamification ↔ Analytics. That's a
  whole-system reasoning problem, not a feature.
- **Security audit** and **Phase 13** — cross-cutting by nature.

## Effort levels

`/goal` and ultracode do different things and compose:

```
/goal              →  KEEP GOING ACROSS TURNS until a measurable condition holds
/effort ultracode  →  PARALLELIZE WITHIN THE WORK across coordinated agents
```

So `/effort ultracode` + `/goal build Momentum` is bad — unbounded work, unbounded fan-out.
`/effort ultracode` + a phase goal with explicit exit checks and a turn cap is right.

**On capacity:** fan-out multiplies consumption, and this is the one place not to think
"I have 20×, who cares." Every ultracode prompt in `PROMPTS.md` already carries the
constraint paragraph:

> Use no more parallel agents than materially improve the task. Prefer 3–6 focused workers
> over broad fan-out. Do not spawn agents for trivial mechanical changes. Each worker gets a
> clear responsibility and non-overlapping file ownership. The lead owns shared files,
> integration, and final verification.

You do not need 37 agents to build a settings page.

---

## Phase ordering

**MVP is Phases 0–4 plus 9** — weekly calendar, task inbox, drag-to-schedule, duration
estimates, Today/Next Up, Pomodoro, XP. That's genuinely usable. Ship it before Phase 5.

The one ordering tension worth knowing: Phase 3 builds the calendar before Phase 4 fixes the
task model, so Phase 4 may have to migrate a single-block scheduling model into multi-block.
The alternative — tasks first — leaves Phase 3 with nothing to schedule onto. If Phase 0
designs the work-block table correctly, the migration never happens, which is why that's
the one schema decision flagged non-negotiable in `specs/00-foundation.md`.

---

## Between every phase

1. Confirm `docs/ROADMAP.md` was updated — status, decisions, known issues, session log.
2. Commit: `git commit -m "implement phase N: <name>"`. One phase, one commit.
3. Start a **new context**.

The `.md` architecture is what makes fresh contexts cheap:

```
fresh context → CLAUDE.md → ROADMAP.md → architecture → current spec → continue
```

That's healthier than carrying every prior phase and debugging session forward.

## When a phase goes sideways

- **Wrong architecture chosen** — stop, fix `docs/ARCHITECTURE.md` first, then re-run the
  phase. Do not patch around a bad decision.
- **Spec turned out wrong** — update the spec file, then re-run. The spec is the contract;
  a stale contract produces stale work.
- **Model is thrashing** — it's usually missing context, not missing capability. Check that
  the session message actually pointed at the right files.
- **Ultracode burning capacity** — drop to `/effort xhigh` and decompose manually.
- **A phase hits its turn cap** — don't just re-run it with a higher cap. Read what it got
  stuck on; it's usually an unresolved Phase 0 decision surfacing late.
