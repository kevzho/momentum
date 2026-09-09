# Momentum — Agent Operating Instructions

`CLAUDE.md` is the engineering constitution for this repository. **Read it first.**
Everything in it applies to you regardless of which model or harness you are running under.

This file adds the rules that are specific to *how agents should work here*, as opposed to
what the code should look like.

---

## Orientation sequence

Every fresh context starts here:

```
CLAUDE.md               →  invariants and engineering rules
docs/ROADMAP.md         →  where the project actually is right now
docs/PRODUCT.md         →  what Momentum is and is not
docs/ARCHITECTURE.md    →  how the code is organized and why
docs/DOMAIN_RULES.md    →  the semantics you must not break
specs/NN-<phase>.md     →  what you are building this session
```

Do not skip `docs/ROADMAP.md`. It is the single source of truth for phase status,
known issues, and architectural decisions made in earlier sessions.

---

## Scope discipline

- Implement **only** the phase you were asked to implement.
- Do not start the next phase because you have context left.
- Do not "improve" unrelated subsystems while passing through them. If you notice a real
  problem outside your scope, record it under **Current known issues** in
  `docs/ROADMAP.md` and move on.
- The acceptance criteria in the phase spec are the definition of done. Not your judgment
  of what would be nice.

## Non-goals are binding

Each spec has a **Non-goals** section. Those items are deliberately deferred. Building them
early is not a bonus; it is scope creep that later phases will have to unwind.

---

## Parallel execution (Ultracode / subagents)

When fanning work out to parallel agents:

- Use **no more parallel agents than materially improve the task.** Prefer 3–6 focused
  workers over broad fan-out.
- Do not spawn agents for trivial mechanical changes.
- Each worker gets a **clear responsibility and non-overlapping file ownership.**
  Two agents must not edit the same core file concurrently.
- Shared foundational files (schema, domain types, date utilities, design primitives) are
  owned by the **lead only**. Workers consume them; they do not edit them.
- The lead remains responsible for integration, conflict resolution, and final verification.
- Verification (typecheck, lint, tests, build) runs **once at the end, by the lead**, over
  the integrated result — not independently per worker.

Good decomposition looks like separable lanes:

```
                 LEAD (integration, shared types)
        ┌────────────┼────────────┐
        ↓            ↓            ↓
    UI surface   interaction   data layer
                 logic         + mutations
        └────────────┼────────────┘
                     ↓
                  tests
                     ↓
                  review
```

Bad decomposition is five agents all editing the calendar grid component.

---

## When you are blocked

If a spec is ambiguous or contradicts an existing architectural decision:

1. Do not guess and build both ways.
2. Do not silently pick one and bury the choice in a commit.
3. Resolve it against `docs/DOMAIN_RULES.md` if possible.
4. If it genuinely requires a product decision, state the blocker explicitly, implement
   everything that does not depend on it, and record the open question in
   `docs/ROADMAP.md`.

## When you finish

1. Run typecheck, lint, and relevant tests. Fix what fails.
2. Update `docs/ROADMAP.md`: phase status, new architectural decisions, new known issues.
3. Update `docs/ARCHITECTURE.md` / `docs/DATABASE.md` if you changed structure or schema.
4. Summarize: files changed, decisions made, assumptions, anything left undone.

Never finish a task by merely suppressing errors.
