# Momentum — Design System

**Status: 🟢 IMPLEMENTED (Phase 1, 2026-09-06).** Everything below exists in
`packages/ui/src/styles/globals.css` and `packages/ui/src/components` unless a row says
otherwise. This document now describes what exists, not what is intended; keep the two in
sync. The four primitives still marked _(deferred)_ are the only gap, and each is deferred
to the phase that owns its data.

---

## Direction

Clean · modern · slightly playful · extremely polished · subtle depth · rounded but not
childish · sparse gradients · strong typography · full dark and light themes.

The bar: it should look like a real funded productivity startup. Not a hackathon dashboard,
not a template, not an RPG.

**Calm, dense, fast, polished, consistent.** In that priority order when they conflict.

## Explicitly avoid

These are the failure modes to audit against — they are also the most common tells of
machine-generated UI:

- Cards wrapping everything, especially nested cards
- Decorative gradients, glassmorphism, ambient blur
- Cartoonish RPG chrome — no gold coins with sparkles, no XP explosions
- Animation without purpose
- Excessive whitespace masquerading as elegance
- Dashboard clutter: rows of stat tiles nobody asked for
- Duplicate page headers (chrome title + page title + section title)
- Explanatory helper text under every field
- Arbitrary one-off colors and inconsistent border radii
- Modals where a side sheet or inline edit would do
- Layout shift on load; buttons of inconsistent height
- Placeholder controls: a button that does nothing is not rendered (the top bar lost its bell)

When in doubt, **remove something.**

---

## Foundation

- **Base:** shadcn/ui, style `radix-nova` (Radix primitives, Lucide icons), Tailwind v4.
  Components are vendored source in `packages/ui/src/components`; add more with
  `pnpm dlx shadcn@latest add <name> -c packages/ui`.
- **Tokens** are CSS custom properties declared in `packages/ui/src/styles/globals.css`
  and exposed to Tailwind through `@theme inline`. Components use utilities backed by
  tokens (`bg-background`, `text-muted-foreground`, `border-border`) — never raw palette
  values, never `[13px]`-style arbitrary values.
- **Themes** are a `.dark` class on `<html>` managed by `next-themes` (system default,
  persisted choice, no flash: the class is set before hydration via the provider's inline
  script). `color-scheme` follows the theme so native controls match.

---

## Tokens

### Spacing

Tailwind's 4px scale, restricted to these steps: `0.5 1 1.5 2 3 4 5 6 8 10 12 16`
(2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64 px).

| Role                                  | Steps           |
| ------------------------------------- | --------------- |
| Inside a control (button, input, chip) | `px-2` `px-2.5` `py-1` |
| Between inline siblings (icon + label) | `gap-1` `gap-1.5` `gap-2` |
| Between rows in a dense list           | `gap-0.5` `gap-1` |
| Panel / sheet padding                  | `p-3` `p-4`     |
| Between sections on a page             | `gap-6` `gap-8` |
| Page gutter                            | `px-4` (mobile) `px-6` (desktop) |

No `padding: 13px`. No `space-y-7`.

### Radii

One base value, three roles. `--radius: 0.5rem`.

| Role      | Utility        | Used for                                            |
| --------- | -------------- | --------------------------------------------------- |
| control   | `rounded-md`   | buttons, inputs, chips, calendar blocks, menu items |
| surface   | `rounded-lg`   | popovers, sheets, side panels, dialogs               |
| pill      | `rounded-full` | avatars, status dots, XP bar, count badges           |
| glyph     | `rounded-sm`   | only elements 16px or smaller: the checkbox box, heatmap cells, `Kbd` _(Phase 13)_ |

Nothing else. If two adjacent elements have different radii, one of them is wrong. The
glyph row exists because `rounded-md` on a 16px box is a circle; it is not a licence for
`rounded-sm` on links, chips or rows (the Phase 13 audit normalised those to `rounded-md`).

### Typography

One family: **Geist Sans** (`--font-sans`). **Geist Mono** (`--font-mono`) only for
`Kbd` and code. Tabular numerals (`tabular-nums`) on every time, duration, count, and
percentage so columns of numbers align.

Tailwind's default size scale plus one addition, `text-2xs` (11px / 16px), used only where
density demands it (15-minute calendar blocks, `Kbd`, table meta). Weights: 400, 500, 600.
Hierarchy comes from weight and color before size.

| Role                         | Classes                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| Body / default               | `text-sm` (14px)                                                   |
| Secondary / meta             | `text-xs text-muted-foreground`                                    |
| Micro (dense surfaces only)  | `text-2xs`                                                         |
| Page title (in `PageHeader`) | `text-lg font-semibold tracking-tight`                             |
| Section label                | `text-xs font-medium uppercase tracking-wide text-muted-foreground`|
| Hero number (weekly review)  | `text-2xl font-semibold tabular-nums`                              |

The page title lives in `PageHeader` and nowhere else. The top bar shows the current
section name only when `PageHeader` is not rendered (mobile). One title per page.

### Color

Semantic tokens only. The shadcn set is the base; Momentum adds `success` and `warning`
(with `-foreground` pairs) for factual state — never for judgment copy.

```
background foreground · card card-foreground · popover popover-foreground
primary primary-foreground · secondary secondary-foreground · muted muted-foreground
accent accent-foreground · destructive · success success-foreground
warning warning-foreground · border input ring
sidebar sidebar-foreground sidebar-primary sidebar-accent sidebar-border sidebar-ring
chart-1 … chart-5
```

**Project palette.** Twelve named hues, `PROJECT_COLORS` in `@momentum/core/types`:
`slate red orange amber green teal cyan blue indigo violet pink rose`. Each defines three
tokens in each theme — `--project-<hue>-bg`, `--project-<hue>-fg`, `--project-<hue>-border`
— exposed as `bg-project-<hue>` / `text-project-<hue>-fg` / `border-project-<hue>-border`.
The `fg` on `bg` pair meets WCAG AA (≥ 4.5:1) in both themes; verify each hue in each
theme independently. The palette is chosen for legibility as calendar block backgrounds,
not for saturation.

**Never color-only.** Block kinds are distinguished by shape and glyph as well as color:

| Kind        | Signal                                                        |
| ----------- | ------------------------------------------------------------- |
| Event       | solid 3px left rule, filled background                        |
| Work block  | 1px outline, checkbox glyph, project color as the outline     |
| Habit block | dashed outline, repeat glyph                                  |
| Completed   | reduced opacity + strikethrough title + check glyph           |

### Elevation

Two levels, both shadows on `popover`/`surface` backgrounds. Structure everywhere else is
a `border-border` line.

| Token              | Used for                                        |
| ------------------ | ----------------------------------------------- |
| `--shadow-popover` | popovers, menus, tooltips, command palette      |
| `--shadow-overlay` | side sheets, dialogs, the drag overlay           |

### Motion

| Token               | Value                          | Used for                                   |
| ------------------- | ------------------------------ | ------------------------------------------ |
| `--duration-fast`   | 120ms                          | hover, focus, toggles, checkbox            |
| `--duration-base`   | 180ms                          | popover / sheet enter and exit, reorder    |
| `--duration-slow`   | 260ms                          | level-up / achievement celebration only    |
| `--ease-standard`   | `cubic-bezier(0.2, 0, 0, 1)`   | everything                                 |

Motion clarifies what moved and where; it never performs. Under
`prefers-reduced-motion: reduce` all durations become 0 and transforms are disabled by a
single global rule in `globals.css` — including XP and level-up feedback.

### Layering

`--z-sticky 10` (column headers, time gutter) · `--z-panel 20` (side panel) ·
`--z-overlay 30` (sheet backdrop) · `--z-popover 40` · `--z-toast 50` · `--z-drag 60`
(dnd-kit `DragOverlay`). No other z-index values.

### Sizes

| Token / rule                  | Value                                         |
| ----------------------------- | --------------------------------------------- |
| Control height                | `h-7` (sm) · `h-8` (default) · `h-9` (lg)     |
| Touch target _(Phase 13)_     | on a coarse pointer (`pointer-coarse:` variants) every control reaches 40px — Button/Input/Select/Toggle/Command items `h-10`, icon buttons `size-10`, the Checkbox keeps its 16px box inside a 40×40 `::after` hit area, HabitCard day cells grow from 20 to 40px — without changing a desktop pixel. Features fix layout, never sizing. |
| Icon size                     | `size-4` default · `size-3.5` in sm controls  |
| Sidebar width                 | 240px expanded · 56px collapsed               |
| Side panel (Plan my week drawer) | 320px                                      |
| Side sheet (task detail)      | 480px, full width below `md`                  |
| `--calendar-hour-height`      | 56px (15-minute slot = 14px, legible at `text-2xs`) |
| `--calendar-gutter-width`     | 56px                                          |
| `--calendar-day-min-width`    | 80px — below this the week grid scrolls inside its own container rather than overflowing the page |
| `--top-bar-height`            | 48px                                          |

Duration and z-index have no Tailwind theme namespace, so they are real utilities declared
with `@utility` in `globals.css`: `duration-fast` · `duration-base` · `duration-slow` and
`z-sticky` · `z-panel` · `z-overlay` · `z-popover` · `z-toast` · `z-drag`. Use those, never
`duration-200` or `z-50`. The week grid's column template is likewise a utility,
`calendar-week-grid`.

---

## Themes

Light and dark are both first-class from Phase 1. Dark mode is not an inverted light mode:
verify contrast, calendar block legibility, and chart palettes independently in each.
Every token above has a value in both `:root` and `.dark`.

---

## Density

Momentum is an information-dense product. The calendar, task list, and Today page should
show a lot without feeling loud. Achieve density with tight, consistent spacing and clear
typographic hierarchy — not with small fonts or thin low-contrast text.

Target: a full week of blocks readable at a glance on a 13" laptop.

---

## Calendar-specific rules

- Block height is proportional to duration and must stay legible at 15 minutes.
- Events, task work blocks, and habit blocks are visually distinguishable at a glance,
  and not only by color (see the kind table above).
- Completed blocks are visibly de-emphasized without becoming unreadable.
- Overlapping blocks degrade gracefully — side-by-side columns, never stacked into
  illegibility (layout algorithm in `docs/ARCHITECTURE.md` §9).
- The current-time indicator is subtle. Today's column is distinguished, not shouting.
- Text truncates cleanly; a 15-minute block still shows something useful.

---

## Gamification restraint

The game layer is present, never dominant.

- XP feedback is a small number and a progress movement. Not confetti.
- Confetti/celebration is reserved for level up, achievement unlock, and weekly goal
  completion — and even then, brief and skippable.
- The level indicator lives in the top bar as a compact element, not a hero banner.
- No health bars, no damage, no punishment visuals of any kind (Domain Rule 7).

---

## Accessibility floor

Non-negotiable, enforced in every phase's acceptance criteria:

- Every interactive element reachable and operable by keyboard, with a visible focus ring
  (`focus-visible:ring-3 focus-visible:ring-ring/50`, as shadcn nova does).
- Every drag interaction has a keyboard equivalent (Domain Rule 10).
- Contrast meets WCAG AA in both themes, including inside colored calendar blocks.
- Semantic HTML first; ARIA only where semantics genuinely fall short.
- Dynamic changes (task completed, XP earned, timer finished, block moved) announced to
  screen readers through the single `Announcer` live region.
- Never signal state by color alone.
- Respect `prefers-reduced-motion`.

---

## Component primitives

Two layers. **`@momentum/ui`** holds everything presentational and framework-agnostic.
**`apps/web/src/components`** holds the few pieces that must know about Next (routing,
data, server actions). Feature components compose these; they do not restyle them.

### `@momentum/ui` — shadcn base to add in Phase 1

`button` `input` `textarea` `select` `checkbox` `switch` `dialog` `sheet` `popover`
`tooltip` `dropdown-menu` `command` `separator` `skeleton` `scroll-area` `tabs` `toggle`
`toggle-group` `badge` `avatar` `progress` `calendar` `sonner`

### `@momentum/ui` — Momentum primitives

| Group    | Primitive           | Responsibility                                                              |
| -------- | ------------------- | --------------------------------------------------------------------------- |
| Layout   | `PageHeader`        | The one page title, optional actions slot. Never duplicated by the top bar. |
|          | `SidePanel`         | Persistent, collapsible column beside content (the calendar's Plan my week drawer). |
|          | `SideSheet`         | Modal-free detail surface on shadcn `sheet` (task detail, block edit).      |
| State    | `EmptyState`        | icon · title · one-line description · single primary action. `titleAs="h1"` for a page-level empty state such as the 404 _(Phase 13)_. |
|          | `Skeleton`          | shadcn base plus route-shaped composites that match final dimensions.       |
|          | `LoadingState`      | Inline pending indicator for panels and buttons; no layout shift.           |
| Data     | `TaskRow`           | Dense row: check · title · project dot · due · estimate/coverage · priority.|
|          | `CalendarBlock`     | The block visual for all three kinds; consumes geometry, owns no logic.     |
|          | `HabitCard`         | Name · target · week dots · progress · consistency · XP. Not a "card" with chrome. Below `sm` the row wraps: name, consistency and actions on the first line, the week strip on a full-width second line; row padding `py-2` _(Phase 13)_. The five day states differ in shape before hue — filled with a check, half-filled, a solid ring, a dashed ring, a bare dot — and each carries its date and state as text, so the week reads in greyscale and to a screen reader. A recordable day is a real button. |
|          | `HabitHeatmap`      | _(Phase 6)_ A habit's longer range as a grid of weeks, in the same five states and the same shape-first encoding. Columns are weeks, rows the seven days of the user's own week; days outside the range are absent rather than drawn as anything. |
|          | `StatTile`          | Label + tabular number. Used sparingly and only where the spec asks.        |
|          | `ProgressRing`      | SVG ring for focus timer and completion ratios.                             |
|          | `XPBar`             | Compact level + progress bar for the top bar.                               |
|          | `ProjectDot`        | The color dot; only place project color is mapped to a token.               |
| Layout   | `PageContainer`     | The page gutter and section rhythm; `fill` for routes that own their scroll. |
| Input    | `DurationInput`     | Minutes with `45m` / `1h30m` / `1.5h` / `2:30` parsing, via `parseDuration` in `@momentum/core/time`. Commits on blur and Enter, never per keystroke; empty means `null`, not `0`. _(Phase 4)_ |
|          | `DatePicker`        | shadcn `calendar` in a popover; emits `LocalDate`. Takes `today` as a prop — it never asks the browser what day it is — and converts on both edges with the browser's own calendar fields, the convention `react-day-picker`'s default `DateLib` uses, so the offset cancels and the emitted `LocalDate` is the day whose cell was clicked. The `Date` values never leave the component and are never persisted. _(Phase 4; corrected by the Phase 5 integration audit, which found the previous UTC-noon convention off by one day east of UTC)_ |
|          | `PrioritySelect`    | P1–P4 with glyph + label; never color-only. `4` reads "None", matching `TaskRow`'s read-only glyph. _(Phase 4)_ |
|          | `CoverageBar`       | Scheduled versus estimated. Over-scheduling is its own segment rather than a bar that overflows, and the accessible name states both numbers. _(Phase 4)_ |
|          | `Chip`              | Removable token (parsed metadata, filters).                                 |
|          | `SegmentedControl`  | Day / Week, 7 / 30 / 90 — a `toggle-group` with roving focus; selection follows focus (radio-group semantics: arrows, Home and End change the value) _(Phase 13)_. |
|          | `Kbd`               | Keyboard hint glyphs.                                                       |
| Feedback | `Toast`             | Thin API over `sonner`: `toast.success/error/info`, one visual style. Sonner's own live region is off; these speak through the `Announcer`. An error toast with an action stays until dismissed and is pressable under a modal _(Phase 13)_. |
|          | `XPToast`           | _(Phase 8)_ Small "+12 XP" with progress movement; no confetti. `toast.xp(amount, reason?)`. |
|          | `AchievementToast`  | _(Phase 8)_ Level up · achievement · weekly goal, and nothing else. Brief, skippable, never queued more than one; `toast.celebrate({ kind, title })`. Renders **no** flourish at all under `prefers-reduced-motion` — the message still arrives. |
| Identity | `ProfileFrame`      | _(Phase 8)_ The first cosmetic collection: a ring around the avatar, from an exhaustive `Record<ProfileFrameKey, string>` for the same reason `ProjectDot` has one. |
|          | `Tooltip`           | shadcn base with the Momentum delay and size.                               |
|          | `Announcer`         | The single `aria-live` region; exposes `announce(message)`.                 |

### `apps/web/src/components` — Next-aware composition

`AppShell` · `Sidebar` (navigation links, collapse state) · `SidebarNav` (the one
navigation list, shared by the rail and the mobile drawer) · `MobileNav` (drawer below
`md`) · `TopBar` (section name on mobile, quick-add, palette trigger, `XPBar`, profile
menu — no bell) · `ProjectDialog` (name + a `role=radiogroup` of twelve `ProjectDot` swatches,
arrows/Home/End move the selection) · `ProjectMenu` (the sidebar row's "…": Rename, Archive;
revealed on hover/focus-within, always on coarse pointers) · the seventh task view tab "Archived"
(an archived row shows a restore icon button in the checkbox's slot and a muted title without
strikethrough) · Settings' switch rows (Label beside `Switch` with a note line that is always laid
out, so hydration cannot shift the section) · `TopBar` (continued: section name on mobile, quick-add, palette trigger, `XPBar`, profile
menu) · `ErrorBoundary` (section boundaries with retry; route boundaries are Next's
`error.tsx`) · `ThemeProvider` · `ThemeToggle` · route `Skeleton` composites in
`components/skeletons.tsx` and `features/*/components/*-skeleton.tsx` ·
`QuickAdd` (Phase 4/11) · `CommandPalette` (Phase 11).

**Sidebar collapse is a cookie, not `localStorage`.** The server reads it in
`app/(app)/layout.tsx` and seeds `SidebarProvider`, so the first paint is already the right
width. See the decisions log in `docs/ARCHITECTURE.md`.

**The one heading rule, concretely.** `PageHeader` renders the `h1` at every width but
hides it visually below `md`; `TopBar` shows the section name only below `md` and marks it
`aria-hidden`, because the `h1` is still the accessible heading. No page renders two
competing titles, at any width.

If a page needs a style that does not exist here, add it to the primitive layer — do not
inline it.
