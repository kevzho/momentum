# Specs

One file per implementation phase. Each follows the same shape:

```
Objective        → what this phase is for, in a sentence or two
User stories     → the behavior, from the user's side
Requirements     → what to build
Acceptance criteria → the checklist that defines "done"
Non-goals        → what is deliberately deferred (binding — do not build these)
```

**Read the spec for your phase, plus `CLAUDE.md`, `docs/ARCHITECTURE.md`, and
`docs/DOMAIN_RULES.md`. Do not read all the specs at once** — the exception is Phase 0,
which skims all of them so the architecture accounts for what's coming.

`docs/RUNBOOK.md` has the exact model, effort, session message, and `/goal` for each phase.

Specs are contracts. If one turns out to be wrong, fix the file first, then implement.
