# Momentum — Product Definition

**Status:** Stable. Changes here are product decisions, not implementation details.

---

## The one-sentence version

Momentum is a gamified personal productivity operating system built on a single mechanic:
**everything competes for the same finite resource — the user's week.**

## Why it exists

Calendar apps, todo apps, habit trackers, and Pomodoro timers are all separately solved.
What nobody solves well is the seam between them: a todo list will happily accept 40 hours
of work into a week that has 12 hours available, and never say a word.

Momentum forces every commitment — tasks, habits, events, focus work — through the same
finite weekly container. That is the product. Everything else is in service of it.

## What it is not

- Not a team/collaboration tool. Single-player, personal.
- Not a project management tool. No sprints, boards, assignees, or workflows.
- Not a note-taking app.
- Not a habit tracker with a calendar bolted on, or a calendar with XP bolted on.
- Not an AI chatbot with a productivity theme.

If a proposed feature does not connect to the weekly time container, it probably doesn't
belong.

---

## Reference points

| Product | What we take |
|---|---|
| Google Calendar | weekly scheduling, readability of a time grid |
| Todoist / Things | speed of capture, task model quality |
| Habitica | progression that makes effort feel cumulative |
| Linear | visual density, precision, keyboard-first efficiency |
| Arc / Raycast | polished command-driven interactions |
| Forest / Pomodoro | focused single-purpose work sessions |

It must feel like **one coherent product**, not five apps sharing a sidebar.

---

## The five systems

**Calendar** — week/day/month views, draggable time blocks, recurring events, color
categories, eventual Google Calendar sync.

**Tasks** — inbox, projects, subtasks, priority, estimated duration, due dates. Tasks
become scheduled work by being dragged onto the calendar.

**Habits** — daily/weekly targets, completion history, consistency tracking. Habits can
reserve calendar time.

**Focus** — Pomodoro presets (25/5, 50/10, 90/20) and custom durations, attached to a task,
recording actual time spent.

**Game layer** — XP, levels, quests, achievements, coins, cosmetic unlocks, weekly progress.
No punishing XP loss for missed days.

---

## Core loop

```
CAPTURE → ESTIMATE → SCHEDULE → FOCUS → COMPLETE → ACTUAL TIME
                                                    ↙        ↘
                                              analytics       XP
                                                   ↓           ↓
                                            better plans   level up
                                                   ↘       ↙
                                                  NEXT WEEK
```

The loop closes on **actual time**. That is the differentiator: Momentum records the
difference between the week you planned and the week you lived, and feeds it back into the
next plan.

---

## Product principles

1. Scheduling is the central workflow. Everything else feeds it or follows from it.
2. Adding a task must be extremely fast — capturable from anywhere in ~2 interactions.
3. Tasks may exist unscheduled. Scheduling is a deliberate, separate act.
4. Users schedule by dragging unscheduled tasks onto the calendar.
5. Calendar events and task work blocks must be visually distinguishable.
6. Focus sessions track actual time, not intended time.
7. Gamification rewards productive behavior and never punishes missed days.
8. The interface is information-dense but calm.
9. Keyboard interaction is first-class, not an accessibility afterthought.
10. Desktop is primary; mobile must remain genuinely usable.
11. Accessibility is never traded for aesthetics.
12. The app reports facts, never judgments. It does not call the user lazy, unproductive,
    or behind. It surfaces neutral capacity and completion information.

---

## MVP (v0.1)

Ship exactly these seven things before anything else:

1. Weekly calendar
2. Task inbox
3. Drag tasks → calendar
4. Task duration estimates
5. Today / Next Up
6. Pomodoro linked to tasks
7. XP + levels

That is a genuinely usable product. Phases 0–4 plus 9 cover it.

## Post-MVP, in rough order

Week planning drawer and Find Time · habits · gamification depth · analytics ·
command palette · PWA · weekly review · desktop shell · estimate calibration ·
AI-assisted week optimization.

## The long game

Once enough history exists, the killer features are decision support, not automation:

> "You estimated this research task at 60 minutes. Similar research tasks have taken you
> ~94 minutes. Schedule 90?"

> "You have 11.5 hours of work due before Friday but 8.2 hours available. Here are the
> three tasks most worth moving."

This is why estimate-vs-actual is a first-class concept from Phase 2 onward, long before
anything uses it.

---

## Platform strategy

Web is the canonical product. A Tauri macOS shell comes later and wraps the same frontend,
adding only what genuinely requires the OS: menu-bar focus timer, global quick-add shortcut,
native notifications, dock badge, calendar integration.

Do not maintain a separate desktop implementation. macOS-specific code lives behind a
desktop capabilities layer.
