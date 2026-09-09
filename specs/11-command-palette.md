# Phase 11 — Command Palette, Quick Add & Natural-Language Parsing

**Model:** Opus 5 · **Effort:** high

## Objective

Make the whole product keyboard-drivable, and make capture nearly frictionless. Build this
after the features exist so the palette can actually reach all of them.

## User stories

- I press ⌘K and can go anywhere or do anything without touching the mouse.
- I can capture a task from any screen in about two interactions.
- I can type "Finish essay tomorrow 60m p1 #school" and get a fully-specified task.
- If my syntax doesn't parse, nothing I typed is lost.

## Requirements

### Command palette

⌘K on macOS, Ctrl+K elsewhere.

**Navigation:** Today · Calendar · Tasks · Habits · Focus · Analytics · Settings
**Creation:** Add task · Add event · Add habit · Start focus session
**Actions:** Complete task · Schedule task · Search tasks · Search projects

Build it around a **typed command registry** so later features register commands without
touching the palette internals. Adding a command should be one small declaration.

Fuzzy search over commands and over user data (tasks, projects). Recent/frequent commands
surface first.

Accessibility: correct focus trapping, focus restoration on close, arrow-key navigation,
and results announced to screen readers.

### Quick Add

A dedicated shortcut, available from anywhere — not requiring navigation to `/tasks`.

Minimum field: title. Optional: project, priority, duration, due date.

**Two interactions from anywhere to a captured task.** That's the bar.

### Natural-language parsing

**Deterministic. No LLM.** (An LLM here would be slower, non-deterministic, and worse at
the thing users actually type.)

Recognize:

| Kind | Forms |
|---|---|
| Dates | `today` · `tomorrow` · weekday names (`friday`, `mon`) |
| Duration | `15m` · `45m` · `90m` · `1h` · `1h30m` |
| Priority | `p1` · `p2` · `p3` · `p4` |
| Project | `#project-name` |

Examples that must work:

```
Finish essay tomorrow 60m
Physics problems friday p1 45m
Read chapter 3 today #school
GVAE analysis monday 90m #research
```

Show parsed metadata as **removable chips** beneath the input, before creation:

```
Finish essay
[ Tomorrow × ]  [ 60 min × ]  [ P1 × ]  [ School × ]
```

Removing a chip returns that value to the title text or clears the field — decide which,
and be consistent.

**Rules:**

- Typing stays fluid even when parsing fails — never block input on the parser
- **Never discard unrecognized text.** Anything unparsed remains part of the title
- Parsing is a suggestion the user can reject, not an interpretation forced on them
- Weekday resolution ("friday") resolves in the user's timezone to the *next* such weekday
- Ambiguity resolves conservatively — when unsure, leave it in the title

## Acceptance criteria

- [ ] ⌘K / Ctrl+K opens the palette from every route
- [ ] All navigation, creation, and action commands work
- [ ] Commands come from a typed registry; adding one requires no palette internals change
- [ ] Fuzzy search matches commands, tasks, and projects
- [ ] Focus is trapped while open and restored on close
- [ ] Arrow keys navigate; Enter executes; Escape closes
- [ ] Results are announced to assistive technology
- [ ] Quick Add is reachable from anywhere via keyboard
- [ ] A task can be captured in two interactions from any screen
- [ ] All four parser categories work across the listed example inputs
- [ ] Parsed values render as removable chips before creation
- [ ] Removing a chip behaves consistently and predictably
- [ ] Unrecognized text is preserved in the title, never dropped
- [ ] Input remains responsive when parsing fails
- [ ] Weekday and relative dates resolve in the user's timezone
- [ ] Unit tests cover parser edge cases: no metadata, all metadata, conflicting metadata,
      metadata-like text that isn't metadata (e.g. "read p1 of the paper"), unicode,
      empty input, and very long input
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` all exit 0

## Non-goals

Do not implement: LLM-based parsing, voice input, recurring-task syntax, multi-task
capture in one line, or `@` mentions.
