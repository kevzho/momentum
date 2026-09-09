# Phase 13 — Final Product-Quality Audit

**Model:** Fable 5.1 · **Effort:** ultracode

## Objective

A comprehensive quality pass over the whole application before it goes in front of real
users. Inspect first, then fix in priority order.

## Method

**Do not immediately change code.** First walk every workflow and produce a prioritized
findings list. Then fix.

### Workflows to inspect

1. Signup / login
2. Create task
3. Edit task
4. Schedule task
5. Drag a task between calendar days
6. Resize a scheduled block
7. Complete a task
8. Create a habit
9. Complete a habit
10. Start a focus session
11. Pause / resume a focus session
12. Complete a focus session
13. Earn XP
14. Level up
15. Use the command palette
16. Review Today
17. Review Analytics
18. Plan next week

### For each workflow, check

Correctness · persistence · loading states · error states · empty states · optimistic
updates and rollback · keyboard navigation · accessibility · mobile usability ·
responsiveness · visual consistency · timezone behavior.

### Classify

- **P0** — bugs: data loss, incorrect persistence, security holes, broken core workflows
- **P1** — usability problems: confusing states, missing feedback, keyboard/a11y gaps
- **P2** — polish: spacing, consistency, minor visual issues

Fix P0 and P1. Record P2 in `docs/ROADMAP.md` if not fixed.

## Design audit

Look specifically for the common machine-generated-UI tells:

excessive rounded cards · unnecessary gradients · too much whitespace · inconsistent
spacing · inconsistent border radii · inconsistent icon sizing · weak information hierarchy
· unnecessary explanatory text · poor empty states · duplicate page headers · layout shift ·
inconsistent button heights · arbitrary colors outside the token set · modal overuse ·
poor dark mode · mobile overflow.

**Simplify rather than adding decoration.** The correct fix for most of these is removal.

## Performance audit

Unnecessary client components · unnecessary rerenders · repeated requests · request
waterfalls · oversized bundles · expensive calendar rendering.

Measure before changing. Report actual numbers, not impressions.

## Security audit

Supabase RLS coverage and correctness · mutation authorization · server-side XP integrity ·
exposed secrets in the client bundle · unsafe user input handling · any path by which one
user's data could reach another.

Write tests that attempt cross-user access and prove they fail.

## Testing

Add or improve tests for critical domain logic: scheduling math, timezone boundaries, XP
calculation and idempotency, recurrence, the NL parser, analytics aggregation.

## Acceptance criteria

- [ ] All 18 workflows inspected and findings recorded before any fixes
- [ ] Every P0 finding fixed
- [ ] Every P1 finding fixed
- [ ] P2 findings fixed or recorded in `docs/ROADMAP.md`
- [ ] Design audit items addressed by simplification
- [ ] RLS verified with automated cross-user access tests
- [ ] No secrets present in the client bundle
- [ ] No XP path accepts a client-supplied amount
- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] Integration/e2e tests pass
- [ ] `pnpm build` succeeds
- [ ] `docs/` reflects the final state of the system

**Do not declare completion while any check fails.**

## Report

Produce: **FIXED** · **REMAINING ISSUES** · **TECHNICAL DEBT** · **NEXT RECOMMENDED
FEATURES**.

## Non-goals

Do not add new product functionality. Do not refactor working subsystems for preference.
Do not upgrade dependencies unless a finding requires it.
