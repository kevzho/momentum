# Phase 1 — App Shell & Design System

**Model:** Opus 5 · **Effort:** high

## Objective

Build the logged-in application shell and the reusable design primitives every later phase
composes from. After this phase the entire product is navigable, looks real, and has zero
backend behavior.

## User stories

- I can navigate between every section of the app from a persistent sidebar.
- I can collapse the sidebar to get more room for the calendar.
- I can switch between light and dark themes, and my choice persists.
- I can use the app on my phone without the layout breaking.
- I can navigate the entire shell with the keyboard alone.

## Requirements

### Layout

**Left sidebar**

```
Momentum
─────────────
Today
Calendar
Tasks
Habits
Focus
Analytics
─────────────
PROJECTS
  Personal
  School
  Research
  + New Project
─────────────
avatar · settings
```

**Top bar** — current page · quick-add button · command palette button · XP/level indicator
· notifications placeholder · profile menu.

**Main content** — the routed view.

The top bar must not duplicate the page's own heading. Decide where the page title lives
and be consistent (see `docs/DESIGN_SYSTEM.md` — duplicate headers are an audit finding).

### Routes

`/today` · `/calendar` · `/tasks` · `/habits` · `/focus` · `/analytics` · `/settings`

Each gets a visually realistic placeholder — enough that the whole product can be walked
through and judged. Placeholders use plausible static data, not "Lorem ipsum" and not
"Coming soon".

### Primitives

Build the primitives listed in `docs/DESIGN_SYSTEM.md` as real reusable components:
`AppShell` · `Sidebar` · `TopBar` · `PageHeader` · `SidePanel` · `SideSheet` ·
`EmptyState` · `Skeleton` · `ErrorBoundary` · `Toast` · `XPBar` · `ProgressRing`.

Implement the token scales — spacing, radii, typography, semantic color, elevation, motion.
**Every later phase must be able to build without inventing new styles.** If a page needs
something that doesn't exist, it goes in the primitive layer.

### Behavior

- Responsive: desktop-first, genuinely usable on mobile with appropriate mobile navigation
- Persistent sidebar on desktop, collapsible, state persisted
- Light and dark themes, both first-class, respecting system preference by default
- Polished skeleton/loading states — no layout shift when content arrives
- Real empty states with a clear next action, not blank space
- Error boundaries at sensible route and section granularity
- Full keyboard navigation with visible focus rings
- Reduced-motion respected

## Acceptance criteria

- [ ] All seven routes render and are reachable from the sidebar
- [ ] Sidebar collapses and expands; the state persists across reload
- [ ] Light and dark themes both work; no unreadable contrast in either
- [ ] Theme choice persists and there is no flash of the wrong theme on load
- [ ] Mobile navigation works; no horizontal overflow at 375px width
- [ ] Every interactive element is keyboard reachable with a visible focus ring
- [ ] Skeletons exist for each route and cause no layout shift
- [ ] Every list surface has a designed empty state
- [ ] Error boundaries catch and display errors without blanking the app
- [ ] Design tokens are defined and used — no arbitrary hex values or spacing in components
- [ ] No page renders two competing headers
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` succeeds

## Non-goals

Do not implement: authentication, database access, real data, drag-and-drop, the working
calendar grid, the command palette (Phase 11), or any XP logic. The XP indicator is a
static placeholder.

## Quality bar

Reference qualities — density and precision (Linear), calmness (Notion), readability
(Google Calendar), polished interaction (Arc/Raycast). Do not imitate their branding.

If it looks like a hackathon dashboard, it isn't done.
