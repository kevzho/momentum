# Phase 4 — Task Manager

**Model:** Opus 5 · **Effort:** xhigh

## Objective

Build the full task management system, and — critically — make the data model correctly
support one task owning multiple work blocks.

## The important part

> A due date and a scheduled date are **different concepts**.
>
> ```
> Essay due Friday
>   ├── Monday    45 min
>   ├── Tuesday   60 min
>   └── Thursday  30 min
> ```

**If the current schema only permits one scheduled block per task, refactor it.**
Do not force the UX around the limitation. Migrate existing data; preserve backwards
compatibility where reasonable. This is the single most expensive thing to get wrong later
(Domain Rule 2).

## User stories

- I can capture a task in seconds without leaving what I'm doing.
- I can see my tasks grouped by inbox, today, upcoming, project, and completed.
- I can open a task's details without navigating away from the list.
- I can break a task into subtasks.
- I can give a task an estimate, and see how much of it I've already scheduled.
- I can select several tasks and act on them at once.
- I can drive the whole list from the keyboard.

## Requirements

### Views

Inbox · Today · Upcoming · All Tasks · Completed · per-Project.

Each view is a filter over the same data with a designed empty state.

### Task fields

Title · description · project · priority · status · estimated duration · due date ·
work blocks (0..n) · subtasks · tags (if the architecture supports them) · completion.

### Quick Add

`Q` (where appropriate) or "+ Task" opens Quick Add. The minimum path is: type a title,
press Enter. Everything else is optional.

Optional inline: project, priority, date, duration.

Keep it **fast**. Quick Add is the most-used interaction in the product; every extra
keystroke is a tax paid hundreds of times. Natural-language parsing arrives in Phase 11 —
build the input so parsing can be added without redesigning it.

### Task detail

Clicking a task opens a **side sheet**, not a new page and not a modal.

Supports: edit title, notes, project, priority, estimate, due date, work blocks (add,
remove, adjust), subtasks, complete, delete/archive.

Show scheduled coverage: "45m of 135m scheduled" — the gap between estimate and scheduled
time is the number that makes the planner useful.

### List UX

Keyboard navigation (arrows, enter to open, space to complete) · bulk selection ·
sorting · filtering · drag reordering with a keyboard alternative · optimistic completion
with rollback · designed empty states.

### Integration with Phase 3

The Plan panel's unscheduled list is defined by "has no work blocks", not by a
`scheduled_start` column. Update it if Phase 3 assumed otherwise.

## Acceptance criteria

- [ ] A task can own multiple work blocks, and the UI shows all of them
- [ ] Any prior single-block modeling is migrated, with existing data preserved
- [ ] Due date and scheduled time are distinct in the schema, the API, and the UI
- [ ] All six views render correctly with correct filtering
- [ ] Quick Add creates a task with title alone, in two interactions from anywhere in-app
- [ ] Quick Add accepts optional project, priority, date, and duration
- [ ] The detail side sheet edits every field and persists
- [ ] Subtasks can be added, completed, reordered, and deleted
- [ ] Scheduled-vs-estimated coverage is visible on the task
- [ ] Keyboard navigation covers move, open, complete, and select
- [ ] Bulk selection supports complete, move to project, and delete
- [ ] Sorting and filtering work and persist within a session
- [ ] Drag reordering works and has a keyboard equivalent
- [ ] Optimistic completion rolls back on failure
- [ ] Every view has a designed empty state
- [ ] Unit tests cover filtering, sorting, coverage math, and the work-block migration
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: natural-language parsing (Phase 11), the Plan My Week drawer or Find Time
(Phase 5), recurring tasks, task dependencies, collaboration, file attachments, or comments.
