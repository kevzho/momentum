# Phase 10 — Analytics

**Model:** Opus 5 · **Effort:** xhigh

## Objective

Give the user an honest picture of how their planned weeks compare to their lived weeks.
The purpose is **reflection, not guilt**.

This is also where the product's long-term differentiator starts: estimate calibration.

## User stories

- I can see how much focused work I've actually done over the last week, month, quarter.
- I can see which projects my time is going to.
- I can see how my estimates compare to reality.
- I can see when in the day I actually complete things.
- I'm shown patterns without being told what they mean about me.

## Requirements

### Time windows
7 days · 30 days · 90 days.

### Metrics
Focused hours · tasks completed · habit completion rate · planned vs. actual time ·
scheduled vs. completed blocks.

### Visualizations (Recharts)

1. Focus time by day
2. Focus time by project
3. Planned vs. actual duration
4. Habit consistency heatmap
5. Task completion trend
6. Productive-time distribution across hours of the day

Charts must be legible in both themes, readable without color discrimination alone, and
have accessible text alternatives for the underlying data.

### Insights — the part with rules

Deterministic. **No AI.** Computed from aggregations, phrased carefully.

Acceptable:

> "You completed 81% of tasks scheduled before 4 PM compared with 62% after 4 PM."
> "Research tasks took approximately 24% longer than estimated this month."
> "Tuesday has been your highest-focus day over the last four weeks."

**Never acceptable:**

> ~~"You work better in the morning."~~ ← causal claim from observational data
> ~~"You've been unproductive this week."~~ ← judgment

Report what was measured. Never explain *why* it happened, never characterize the user
(Domain Rule 8).

**Sample size gating:** define a minimum threshold per insight type and suppress the
insight below it. A pattern from three data points is noise. Showing nothing is correct
behavior for a new account — build a real empty state for it.

### Aggregation layer

Build clean, tested aggregation utilities separate from the chart components. These same
utilities will feed Phase 14's weekly review and, eventually, estimate-based scheduling
suggestions. Design them to be reused.

All bucketing (by day, by week, by hour) resolves in the user's timezone.

## Acceptance criteria

- [ ] All three time windows work and switch without a full reload
- [ ] All six visualizations render with correct data
- [ ] Charts are legible in light and dark themes
- [ ] Chart data is accessible to screen readers
- [ ] Planned vs. actual comparison is correct and never conflates the two values
- [ ] Insights only appear above their sample-size threshold
- [ ] No insight makes a causal claim
- [ ] No copy characterizes or judges the user
- [ ] New accounts see a designed empty state, not broken charts
- [ ] Day/week/hour bucketing uses the user's timezone
- [ ] Aggregation utilities are separate from components and unit tested
- [ ] Aggregations are correct across DST boundaries and week boundaries
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: AI-generated insights, data export, goal setting, comparison against
other users, predictive forecasting, or automatic estimate adjustment (surface the estimate
gap; don't act on it yet).
