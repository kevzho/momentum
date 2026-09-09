# Phase 3 — Weekly Calendar

**Model:** Opus 5 · **Effort:** ultracode

## Objective

Build Momentum's primary interaction surface: an interactive weekly calendar where events
and tasks are scheduled and manipulated directly. This is the centerpiece of the product —
everything else feeds it or follows from it.

## User stories

- I can see my whole week at a glance and tell what's happening when.
- I can click empty space to create an event at that time.
- I can drag vertically across empty space to block out a span of time.
- I can drag an unscheduled task onto a time slot and it becomes scheduled work.
- I can drag an existing block to a different time or a different day.
- I can resize a block to change its duration.
- I can click a block to edit it without leaving the planner.
- I can complete a scheduled task directly from its block.
- I can do all of the above with only a keyboard.

## Requirements

### Structure

```
┌──────────────────────────────────────────────────────────────────┐
│  ‹ Prev   Today   Next ›     Sep 7 – Sep 13        [Day] [Week]  │
├────────┬─────────────────────────────────────────────────────────┤
│        │  MON 7   TUE 8   WED 9   THU 10  FRI 11  SAT 12  SUN 13 │
│  5 AM  │                                                          │
│  6 AM  │                                                          │
│  ...   │            ┌──────────┐                                  │
│ 11 PM  │            │ AP CHEM  │                                  │
└────────┴─────────────────────────────────────────────────────────┘
```

- Time labels on the left; seven day columns (week start from user preference, default Monday)
- Time grid roughly 5:00 AM – 12:00 AM, vertically scrollable, sensible initial scroll position
- Block height proportional to duration, legible down to 15 minutes
- Current-time indicator on today's column
- Today visually distinguished — distinguished, not shouting

### Block content

Title · time range · optional project · task indicator · completion state.
Events, task work blocks, and habit blocks must be distinguishable at a glance and **not by
color alone**.

### Interactions

1. **Click empty space** → create-event popover, prefilled with the clicked date and time
2. **Drag vertically on empty space** → create a block spanning the dragged range
3. **Drag an existing block** → reschedule (time and/or day)
4. **Resize from top or bottom edge** → change duration
5. **Click a block** → edit popover or detail panel
6. **Keyboard alternatives for every one of the above** — non-negotiable (Domain Rule 10)
7. Snap to a configurable increment, default 15 minutes
8. Overlapping blocks render side by side, gracefully, without becoming illegible
9. Escape cancels an in-progress drag and restores the original position

### Plan side panel

A collapsible panel beside the calendar:

- **UNSCHEDULED** — tasks with no work blocks yet
- **UPCOMING** — tasks with due dates in range

Dragging an unscheduled task onto the grid creates a work block. Default duration comes
from the task's `estimated_minutes`:

```
Task "Finish statistics homework", estimated_minutes = 45
  dropped on Tuesday 4:00 PM
  → work block Tue 16:00–16:45, linked to the task
```

The block stays linked to the task. Editing one reflects in the other where it should
(title), and not where it shouldn't (a block's time is not the task's due date).

### Completion

A scheduled task block carries a small completion control. Per `docs/DOMAIN_RULES.md` §2,
be explicit about what completing a block means when a task has several: implement the
behavior decided in Phase 0, and if it wasn't decided, decide it here and record it in
`docs/DOMAIN_RULES.md`.

### Drag-and-drop implementation

Use **dnd-kit**. Do not substitute FullCalendar or a similar all-in-one component — we need
control over the interaction model.

Handle: pointer input, keyboard input, collision detection, snapping, cancellation,
optimistic updates, and **rollback on failed persistence**.

### Performance

Do not render thousands of unnecessary DOM nodes. The grid is a known-size structure —
render it as such. Memoize where measurement justifies it; do not prematurely optimize.

### Timezone

All rendering and all mutation resolve through the centralized date utilities using the
user's profile timezone (Domain Rule 4). A block at 11:30 PM local belongs to today's column.

## Acceptance criteria

- [ ] Seven-day week renders with correct dates for the displayed range
- [ ] Previous / Today / Next navigation works, including across month and year boundaries
- [ ] Today is highlighted and the current-time indicator is correct
- [ ] Clicking empty space opens creation prefilled with that date and time
- [ ] Dragging on empty space creates a block of the dragged duration
- [ ] Blocks can be moved to a different time and to a different day
- [ ] Blocks can be resized from both edges
- [ ] Movement and resizing snap to 15-minute increments
- [ ] Unscheduled tasks can be dragged from the Plan panel onto the grid
- [ ] `estimated_minutes` determines the initial block length
- [ ] The created block remains linked to its task
- [ ] All changes persist and survive a page reload
- [ ] A failed mutation rolls back the optimistic update and surfaces the error
- [ ] Every drag action has a working keyboard equivalent, announced to screen readers
- [ ] Overlapping blocks render side by side and remain readable
- [ ] Escape cancels an in-progress drag
- [ ] A scheduled task block can be completed from the block
- [ ] Unit tests cover: date calculations, week boundaries, snapping math, pixel↔time
      mapping, duration math, and timezone-sensitive boundary cases (DST, midnight-crossing)
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: Google Calendar sync, AI scheduling, the recurring-event editor UI
(schema support only), a mobile-specific calendar redesign, month view, the Plan My Week
drawer (Phase 5), or habit block generation (Phase 6).

## Ultracode decomposition

Separable lanes with non-overlapping ownership:

```
              LEAD — shared types, integration, verification
     ┌──────────────┬──────────────┬──────────────┐
     ↓              ↓              ↓              ↓
  grid + block   DnD + keyboard  data layer +   Plan panel
  rendering      interaction     mutations      + drag source
     └──────────────┴──────────────┴──────────────┘
                          ↓
                   tests → review
```

The lead owns the shared time/coordinate utilities. Workers consume them.
