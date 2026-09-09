# Momentum — Architecture

**Status: 🟢 DECIDED (Phase 0, 2026-09-06).** Every numbered item below is a frozen
decision with its rationale and the alternatives rejected. Reversing one requires a new
entry in the decisions log at the end of this file and a matching line in
`docs/ROADMAP.md`. Do not patch around a decision; change it in writing first.

Companion documents: `docs/DATABASE.md` (schema), `docs/DESIGN_SYSTEM.md` (tokens and
primitives), `docs/DOMAIN_RULES.md` (semantics).

---

## Confirmed stack and resolved versions

Verified together on 2026-09-06 (install + typecheck + lint + test + build + dev). Shared
versions are pinned once in `pnpm-workspace.yaml` under `catalog:`; packages reference them
as `"catalog:"`.

| Concern             | Package(s)                                             | Version                       |
| ------------------- | ------------------------------------------------------ | ----------------------------- |
| Runtime             | Node · pnpm                                            | 24.14.0 · 10.14.0             |
| Framework           | `next` (App Router, Turbopack)                         | 16.3.4                        |
| UI runtime          | `react` · `react-dom`                                  | 19.2.8                        |
| Language            | `typescript`                                           | 6.0.3                         |
| Styling             | `tailwindcss` · `@tailwindcss/postcss`                 | 4.3.3                         |
| Components          | `shadcn` (CLI + `shadcn/tailwind.css`, style `radix-nova`) · `radix-ui` · `lucide-react` · `class-variance-authority` · `cn` · `tw-animate-css` | 4.21.0 · 1.6.7 · 1.41.0 · 0.7.1 · 0.2.6 · 1.4.0 |
| Dates               | `date-fns` · `@date-fns/tz`                            | 4.4.0 · 1.5.0                 |
| Database client     | `@supabase/supabase-js`                                | 2.115.0                       |
| Lint / format       | `eslint` · `eslint-config-next` · `eslint-config-prettier` · `prettier` · `prettier-plugin-tailwindcss` | 9.39.5 · 16.3.4 · 10.1.8 · 3.9.6 · 0.8.1 |
| Tests               | `vitest` · `vite` · `@vitejs/plugin-react` · `jsdom` · `@testing-library/react` | 5.0.0 · 8.2.2 · 6.1.1 · 30.0.1 · 16.3.3 |
| Types               | `@types/node` · `@types/react` · `@types/react-dom`    | 24.13.3 · 19.2.18 · 19.2.7    |

Resolved but installed at first use (versions and peer ranges verified in Phase 0):

| Concern           | Package(s)                                                              | Version                          | First used |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------- | ---------- |
| Server auth       | `@supabase/ssr` (peer `supabase-js ^2.114` ✓)                           | 0.12.6                           | Phase 2    |
| Validation        | `zod` (in catalog)                                                      | 4.5.4                            | Phase 2    |
| Theme             | `next-themes`                                                           | 0.4.6                            | Phase 1    |
| Toasts            | `sonner`                                                                | 2.0.8                            | Phase 1    |
| Drag and drop     | `@dnd-kit/core` · `@dnd-kit/sortable` · `@dnd-kit/modifiers` · `@dnd-kit/utilities` | 6.3.1 · 10.0.0 · 9.0.0 · 3.2.2 | Phase 3 |
| Charts            | `recharts`                                                              | 3.10.1                           | Phase 10   |
| Palette           | `cmdk`                                                                  | 1.1.1                            | Phase 11   |
| E2E               | `@playwright/test` (Next peer `^1.51.1` ✓)                              | 1.63.0                           | Phase 3    |

Deliberately **not** the newest available, with the reason:

- **TypeScript 6.0.3, not 7.0.2.** `typescript-eslint` (pulled in by `eslint-config-next`)
  declares `typescript >=4.8.4 <6.1.0`. TypeScript 6 is the deprecation bridge to 7 and
  passed `tsc`, ESLint, and `next build` in Phase 0. Move to 7 when `typescript-eslint`
  supports it; Next 16.3 already runs the local `tsc` CLI so the framework side is ready.
  Note: TS 6 defaults `types` to `[]`, so `tsconfig.base.json` sets `"types": ["node"]`.
- **ESLint 9.39.5 (maintenance line), not 10.10.0.** `eslint-config-next` depends on
  `eslint-plugin-import`, whose peer range stops at ESLint 9. Upgrade when that plugin, or
  `eslint-config-next`'s replacement for it, declares ESLint 10 support.
- **`@dnd-kit/core` 6.x, not `@dnd-kit/react` 0.5.** The rewrite is pre-1.0 with an
  unstable API. Revisit after 1.0.
- **`@date-fns/tz`, not `date-fns-tz`.** `@date-fns/tz` is the first-party timezone
  package for date-fns v4 (`TZDate`, `tz()` context option).

---

## 1. Repository shape

**Decision.** pnpm workspaces monorepo: `apps/web` plus `packages/core`, `packages/db`,
`packages/ui`. Workspace packages are consumed **as TypeScript source** ("just-in-time"
packages): each declares `exports` pointing at `src/*.ts`, Next transpiles them via
`transpilePackages`, and Vitest and `tsc` read them directly. There is no per-package
build step and no Turborepo. Root scripts fan out with `pnpm -r` / `pnpm --filter`.

**Rationale.** The domain logic (time, scheduling, recurrence, XP math) must be testable
without booting Next, and must be importable by the Phase 15 desktop shell's auxiliary
windows. A package boundary is also the only thing that makes "no Supabase in components"
and "no framework code in the domain" mechanically enforceable (see the lint rules in §2).
With source-consumed packages the cost is five small config files, not a build graph.
Turborepo adds task caching and orchestration; with one app, no compiled packages, and
`pnpm -r` running typecheck/lint/test in parallel, there is nothing yet for it to
orchestrate. Add it when CI time justifies a remote cache.

**Rejected.**

- _Single Next app with internal modules._ Makes Phase 15 a refactor, and every
  boundary rule becomes a convention rather than an import that fails.
- _Compiled packages (tsup/tsc emit)._ A second build to keep fresh in watch mode; stale
  `dist` bugs; no benefit while every consumer is a bundler.
- _Turborepo now._ Deferred, not rejected. Nothing to cache yet.

## 2. Directory architecture

```
momentum/
├── apps/web/                          @momentum/web — the product
│   ├── src/app/                       routes only: layouts, pages, loading/error files
│   │   ├── (auth)/{login,signup,reset-password}/       Phase 2
│   │   ├── (app)/                     authenticated shell (layout.tsx = AppShell)
│   │   │   ├── today/ calendar/ tasks/ habits/ focus/ analytics/ settings/ review/
│   │   │   └── layout.tsx  error.tsx  loading.tsx
│   │   ├── auth/callback/route.ts     Supabase code exchange (route handler)
│   │   ├── layout.tsx  global-error.tsx  not-found.tsx
│   ├── src/features/<feature>/        one folder per product area
│   │   ├── components/                server and client components for the feature
│   │   ├── queries.ts                 server-only reads (the ONLY place besides actions that touches @momentum/db)
│   │   ├── actions.ts                 'use server' mutations
│   │   ├── schemas.ts                 zod input schemas shared by actions and forms
│   │   └── hooks/                     client hooks specific to the feature
│   │   (features: auth, calendar, tasks, planning, habits, focus, gamification, today,
│   │    analytics, palette, review, settings)
│   ├── src/components/                Next-aware composition: AppShell, Sidebar, TopBar,
│   │                                  ErrorBoundary, ThemeProvider, providers/
│   ├── src/lib/
│   │   ├── supabase/{server,proxy}.ts client factories (cookie-bound, user-scoped)
│   │   ├── auth/session.ts            requireSession() — user + profile, React.cache()d
│   │   ├── actions/                   ActionResult type, useOptimisticAction, error mapping
│   │   ├── time/                      useNow, useMidnightRollover, UserSettingsProvider
│   │   ├── env.ts                     validated process.env (zod), server-only
│   │   └── platform/                  capabilities layer, web implementation (Phase 15)
│   ├── src/proxy.ts                   session refresh + route protection (Next 16 "proxy")
│   ├── e2e/                           Playwright (from Phase 3)
│   ├── public/
│   ├── components.json                shadcn CLI config (aliases into @momentum/ui)
│   ├── next.config.ts  tsconfig.json  vitest.config.mts  AGENTS.md  CLAUDE.md
├── packages/core/                     @momentum/core — framework-free domain
│   └── src/
│       ├── types/                     entity types + enum constants (Phase 0)   → @momentum/core/types
│       ├── time/                      tz, boundaries, snapping, formatting     → @momentum/core/time
│       ├── recurrence/                series expansion, overrides             → @momentum/core/recurrence
│       ├── calendar/                  grid geometry, overlap layout           → @momentum/core/calendar
│       ├── tasks/                     filtering, sorting, coverage math       → @momentum/core/tasks
│       ├── habits/                    targets, consistency, block generation  → @momentum/core/habits
│       ├── scheduling/                capacity, conflicts, Find Time          → @momentum/core/scheduling
│       ├── focus/                     elapsed/remaining derivation            → @momentum/core/focus
│       ├── gamification/              level curve, task XP, quest selection      → @momentum/core/gamification
│       ├── analytics/                 aggregation, insight gating             → @momentum/core/analytics
│       └── parser/                    quick-add natural-language parser       → @momentum/core/parser
├── packages/db/                       @momentum/db — data access
│   └── src/
│       ├── database.types.ts          generated (`supabase gen types`), never edited
│       ├── mappers/                   row ↔ domain type
│       └── repositories/              functions over SupabaseClient<Database>
├── packages/ui/                       @momentum/ui — design system (docs/DESIGN_SYSTEM.md)
│   └── src/{components,lib,hooks,styles}
├── supabase/                          migrations/, seed.sql, config.toml (Phase 2 runs `supabase init`)
├── docs/  specs/
├── eslint.config.mjs  prettier.config.mjs  tsconfig.base.json  vitest.config.mts
└── pnpm-workspace.yaml  package.json  .env.example
```

**Package boundaries and why there are three, not eight.** The `packages/README.md` sketch
listed eight packages. They would all share one dependency set (TypeScript + date-fns) and
one test environment, so splitting them buys config, not isolation. Boundaries are drawn
where the dependency set or the environment actually differs:

| Package          | Depends on                       | May not import                         | Environment |
| ---------------- | -------------------------------- | -------------------------------------- | ----------- |
| `@momentum/core` | `date-fns`, `@date-fns/tz`       | react, next, supabase, db, ui          | node        |
| `@momentum/db`   | `supabase-js`, core              | react, next, ui                        | node        |
| `@momentum/ui`   | react, radix, cva, lucide, core  | next, supabase, db                     | jsdom       |
| `@momentum/web`  | everything                       | supabase/db outside designated modules | jsdom/e2e   |

Inside `core`, modules are reached only through subpath exports (`@momentum/core/time`),
never a package-wide barrel, and depend on each other only in this order:
`types → time → recurrence → {calendar, tasks, habits, focus, gamification, parser} →
scheduling → analytics`. A module that later needs a different dependency set (for
example analytics needing a statistics library) is promoted to its own package; the
subpath export already isolates its import surface, so the move is mechanical.

**Enforcement.** `eslint.config.mjs` encodes the table above with `no-restricted-imports`,
and additionally forbids in `apps/web`: `@supabase/*` and `@momentum/db` anywhere except
`lib/supabase/**`, `features/**/queries.ts`, `features/**/actions.ts`, and `proxy.ts`;
`date-fns` anywhere; and `new Date()` inside `.tsx` files (Domain Rule 5). Phase 2 must
not weaken these; it may add to them.

**Rejected.** Eight packages mirroring the README (identical deps, cross-package type
cycles between scheduling/tasks/calendar); a `packages/config` package for shared
tsconfig/eslint (one root config is simpler and lints the workspace in one pass).

## 3. Domain model

**Decision.** Three representations, one direction of truth:

```
supabase/migrations/*.sql   →   packages/db/src/database.types.ts   →   @momentum/core/types
   (schema: source of truth)        (generated, checked in)              (hand-written domain types)
                                                 ↘                         ↙
                                          packages/db/src/mappers  (row ↔ domain, explicit)
```

- The **schema** is the source of truth for what exists. Generated `Database` types are
  its mechanical mirror and are regenerated on every migration (`docs/DATABASE.md`).
- **Domain types** (`packages/core/src/types`, written in Phase 0) are the vocabulary the
  rest of the code speaks: camelCase, discriminated unions (`CalendarBlock`), and branded
  scalars. They are hand-written so that the app is not coupled to column naming and so
  that the union shapes the database cannot express (`kind` narrowing) exist in one place.
- **Mappers** in `@momentum/db` are the only code that knows both shapes. They are
  total functions (`rowToTask`, `taskToInsert`) and are unit-tested. Repositories return
  domain types; nothing above `@momentum/db` ever sees a row.
- **Enum parity** is a compile-time test in `@momentum/db`: for every enum,
  `Expect<Equal<Database['public']['Enums']['task_status'], TaskStatus>>`. A migration
  that adds a value fails typecheck until the domain constant is updated.

**Scalar conventions** (`packages/core/src/types/scalars.ts`):

| Type           | Representation                              | Why                                                                       |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| `Instant`      | branded ISO-8601 UTC string, trailing `Z`   | Serialization-stable across RSC, actions, JSON, storage; identical to the DB value |
| `LocalDate`    | branded `YYYY-MM-DD`                        | Calendar dates are not instants (Domain Rule 4); maps to `date`           |
| `LocalTime`    | branded `HH:MM`                             | Working hours, preferred start times                                      |
| `IanaTimeZone` | branded string                              | Profile timezone                                                          |
| `Minutes`      | integer number                              | Every duration in the system                                              |
| `Weekday`      | `0..6`, 0 = Sunday                          | date-fns `weekStartsOn` convention                                        |
| ids            | plain `string` (UUID)                       | Branding ids adds casts everywhere for a bug class that RLS already covers |

`Date` objects never cross a module boundary; they exist transiently inside
`@momentum/core/time`. **Rejected:** `Date` in domain types (mutable, and serialization
through JSON — service worker caches, `localStorage`, logs — silently changes meaning);
`Temporal` (not in the mandated stack; date-fns v4 covers the need).

## 4. Database access

The schema is owned by `docs/DATABASE.md`. Architecturally: the app reaches the database
only through a **user-scoped** Supabase client created per request from the session
cookies (`lib/supabase/server.ts`, `@supabase/ssr` `createServerClient`), passed into
repository functions from `@momentum/db`. Row-level security is therefore the real
authorization for every read and write; the application layer adds validation and
composition, never a second permission model.

The single most important schema decision — **work blocks are rows of one
`calendar_blocks` table with `kind = 'work'` and a required `task_id`, never columns on
`tasks`** — is made and justified in `docs/DATABASE.md` §`calendar_blocks`. Phase 3 must
not add `scheduled_start`/`scheduled_end` to tasks under any circumstances; the multi-block
model exists from the first migration, so the Phase 4 migration the runbook worried about
never happens.

There is **no browser Supabase client in v1**. Reads happen in server components,
mutations in server actions, auth flows in server actions and one route handler. The only
thing a browser client would add is realtime subscriptions, which are a non-goal.

## 5. Server / client component boundaries

**Default: server.** A component is a client component only if it is in this table or is
a leaf that needs one of these reasons: pointer/keyboard interaction state, browser APIs,
`useOptimistic`/`useTransition`, or a context consumer.

| Surface                                        | Client? | Reason                                              |
| ---------------------------------------------- | ------- | --------------------------------------------------- |
| Route layouts, pages, `PageHeader`, data loading | no    | read via `queries.ts`, pass domain objects down      |
| Calendar grid + blocks + DnD + keyboard layer   | yes     | pointer, keyboard, dnd-kit context, optimistic state |
| Planning drawer (Plan my week)                  | yes     | drag source, live capacity/warnings over the optimistic week, Find Time dialog |
| Task list (rows, selection, keyboard, reorder)  | yes     | roving focus, bulk selection, `useOptimistic`        |
| Task detail side sheet                          | yes     | form state; initial data passed from the server      |
| Quick Add, command palette                      | yes     | input, parser chips, focus trap                      |
| Focus timer                                     | yes     | ticking render from persisted timestamps             |
| Habit completion controls, quest rows           | yes     | optimistic toggles (rows themselves render on server)|
| Charts (Recharts)                               | yes     | library requirement; data aggregated on the server   |
| Current-time indicator, greeting, relative times| yes     | time-dependent rendering (see §10)                   |
| Theme toggle, sidebar collapse                  | yes     | persisted browser state                              |
| Toasts, `Announcer`                             | yes     | imperative                                           |
| Settings forms                                  | yes     | forms; page shell is server                          |

Pattern: a server component fetches, then renders a client "island" with serializable
props. Islands are leaves of a feature; server wrappers own data. Client components never
import `queries.ts`; they call server actions.

**Rejected.** Client-side data fetching for the calendar (would duplicate the read path
and need a client cache, see §7). `cacheComponents` / `"use cache"` in v1: every app
route is per-user and cookie-dependent; the Cache Components model would require Suspense
boundaries around all data on every page for no cacheable content. Revisit if a public
marketing surface is added.

## 6. Data access layer

**Reads.** `features/<feature>/queries.ts` (`import 'server-only'`) exposes functions like
`getWeekBlocks(week: LocalDate)`. Each calls `requireSession()` (React `cache()`d: one
session lookup per request), obtains the request-scoped client, calls repository
functions from `@momentum/db`, and returns domain types. Pages call queries; nothing else
does.

**Mutations.** `features/<feature>/actions.ts` (`'use server'`). Every action:

```ts
export async function moveBlock(input: unknown): Promise<ActionResult<CalendarBlock>> {
  const parsed = moveBlockInput.safeParse(input);          // zod, from schemas.ts
  if (!parsed.success) return validationError(parsed.error);
  const { supabase } = await requireSession();             // redirects if unauthenticated
  const result = await blocks.move(supabase, parsed.data); // repository; RLS enforces ownership
  if (result.ok) refresh();                                // next/cache — re-render the current route tree
  return result;
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; message: string; fieldErrors?: Record<string, string[]> } };
// ActionErrorCode = "unauthenticated" | "forbidden" | "not_found" | "validation" | "conflict" | "unavailable"
```

Actions never throw for expected failures; a thrown error is a bug and reaches an error
boundary. Trusted mutations (completion, XP, focus lifecycle, habit completion) call the
database functions in `docs/DATABASE.md` via `supabase.rpc(...)` from the repository —
never by writing ledger tables directly.

**Revalidation.** After a mutation, `refresh()` (from `next/cache`) re-renders the current
route with fresh data; `revalidatePath('/calendar')` when a mutation on one route must
invalidate another (completing a task from Today invalidates Calendar and Tasks). No
`revalidateTag` in v1 because nothing is cached with tags (§5).

**Route handlers** (`app/**/route.ts`) exist only for non-RSC consumers: `auth/callback`
(Supabase code exchange), `version` (the build stamp the service worker polls), `api/export` (a
browser download of the user's rows; its data access lives in `features/export/queries.ts` and
returns raw `Row<T>`s on purpose), and historically
(Supabase code exchange), future webhooks, and Phase 12's service-worker offline JSON.
Never for the app's own UI mutations.

**Rejected.** Route handlers + `fetch` for mutations (no progressive enhancement, manual
serialization, a second auth path). Scattering `createServerClient` calls in pages (that
is exactly what the lint rule prevents). A generic `Repository<T>` base class (the queries
are too different; plain functions over a typed client are simpler and testable).

## 7. Client state strategy

**Decision.** No client cache library and no global store. Each kind of state has one
home:

| State                                     | Home                                                       |
| ----------------------------------------- | ---------------------------------------------------------- |
| Server data (tasks, blocks, habits…)      | RSC props; refreshed by actions (§6)                       |
| Optimistic overlays                       | `useOptimistic` via `useOptimisticAction` (§8)             |
| Navigational state (week, view, filters)  | URL search params (`?week=2026-09-07&view=week`)           |
| Per-session UI state (sort, expanded)     | React state; `sessionStorage` where the spec says "persists within a session" |
| Persisted preferences (theme, sidebar)    | `next-themes` `localStorage`; sidebar in a cookie the server reads (log entry 2026-09-06) |
| Focus-end notification (on/off)           | `localStorage` `momentum.notifications.focusEnd` via `useSyncExternalStore` in `lib/notifications/focus-notification.ts` (server snapshot: unsupported, off). Per device because the browser permission is per device; no profile column |
| Profile settings (tz, week start, snap)   | `UserSettingsProvider` context seeded by the server        |
| Active focus session                      | `FocusSessionProvider` context seeded by the server, ticks locally |
| Command registry (Phase 11)               | module-level registry + context                            |
| Transient feedback                        | `sonner` toasts, `Announcer`                               |

**Rationale.** Reads are server-rendered, so a client cache would hold a second copy of
data that already arrives as props, and every mutation would have to keep both in sync.
The two cross-cutting candidates for a store (active focus session, settings) are small,
rarely updated, and served by contexts. A store is added only when a context is measured
to cause re-render problems, and that addition goes in the decisions log.

**Rejected.** TanStack Query (excellent for client-fetched data; here it would pull
fetching into client components and contradict §5). Zustand/Redux (nothing to put in it).
`cacheComponents` as the "server cache" (§5).

## 8. Optimistic update strategy

One mechanism for every optimistic mutation: `useOptimisticAction` in
`apps/web/src/lib/actions/`.

```
apply      →  optimistic reducer runs inside startTransition (useOptimistic)
persist    →  the server action runs with the same input
reconcile  →  on ok: refresh() re-renders with server truth; optimistic state is replaced
roll back  →  on !ok or throw: the transition settles with unchanged server props, so React
              discards the optimistic state; the hook shows toast.error(result.error.message)
              with a Retry action, and calls onError for feature-specific cleanup
```

```ts
const { state, run, pending } = useOptimisticAction({
  serverState: blocks,                                   // props from the server
  action: moveBlock,                                     // ActionResult-returning server action
  optimistic: (state, input) => applyMove(state, input), // pure, from @momentum/core
});
```

Rules that make it uniform:

- Creates generate their UUID on the client (Domain Rule 17), so optimistic and persisted
  rows share a key and retries are idempotent (unique-violation on retry = success).
- Every failure is visible: a toast with the server's message and, for validation errors,
  field errors mapped onto the form. Silent divergence is a P0 bug (Domain Rule 11).
- `pending` disables only the control that started the mutation, never the page.
- Sequential mutations on the same entity are serialized by the transition queue; the hook
  does not attempt to merge concurrent edits.
- Time-dependent optimistic values (e.g. `completedAt`) use the client's clock only for
  display and are replaced by the server's value on reconcile.

**Rejected.** Per-feature `useState` + manual revert (the exact improvisation this rule
forbids). Client-side mutation queues with offline replay (Phase 12 explicitly scopes
offline mutations as "fail visibly").

## 9. Drag-and-drop scheduling strategy

Library: `@dnd-kit/core` (+ `modifiers`, `utilities`; `sortable` for list reorder in
Tasks). One `DndContext` wraps the calendar grid and the Plan panel.

**Geometry** lives in `@momentum/core/calendar` as pure, unit-tested functions; the React
layer only calls them:

```ts
interface GridSpec { dayStartMinutes: number; dayEndMinutes: number; hourHeightPx: number; snapMinutes: number }
// defaults: 300 (05:00) … 1440 (24:00), 56px, profile.snapMinutes (15)
minutesFromY(y: number, spec): number             // unsnapped
yFromMinutes(minutes: number, spec): number
snap(minutes: number, spec): number               // to nearest snap increment
clampSpan(start: number, duration: number, spec): { start: number; end: number }
resolveDrop({ pointerY, grabOffsetY, durationMinutes, spec }): { start: number; end: number }
resolveResize({ edge: "start" | "end", pointerY, original: { start; end }, spec, minMinutes }): { start; end }
layoutOverlaps(spans: { id; start; end }[]): Map<id, { column: number; columns: number }>
```

`layoutOverlaps` groups mutually overlapping spans into clusters (interval sweep), assigns
each span the lowest free column in its cluster, and reports the cluster width, so
overlapping blocks render side by side with equal widths and never stack.

**Sensors and collision.**

- `PointerSensor` with `activationConstraint: { distance: 4 }` so clicks still open the
  block and empty-space clicks still create.
- `KeyboardSensor` with a custom `coordinateGetter`: ↑/↓ move by one snap increment
  (`snapMinutes` × pixel-per-minute), ←/→ by one day column, Shift+↑/↓ by one hour. The
  same code path as pointer drags, so keyboard and pointer can never diverge.
- Droppables are the **seven day columns** (plus one "all-day" strip per column later),
  not per-slot cells. Collision detection is `pointerWithin` on columns; the time comes
  from pointer Y via `resolveDrop`. Rejected: per-slot droppables (532+ nodes, and
  `closestCenter` snaps to the wrong slot for tall blocks); `rectIntersection` (a block
  straddling two columns is ambiguous).

**Draggable payloads** (typed, in `features/calendar/dnd.ts`):

```ts
type DragData =
  | { type: "task"; taskId: string; durationMinutes: number }               // from the Plan panel
  | { type: "block"; blockId: string; kind: BlockKind; durationMinutes: number; grabOffsetY: number }
  | { type: "resize"; blockId: string; edge: "start" | "end" };
```

**Interaction lifecycle.**

1. `onDragStart`: record the payload; announce "Picked up <title>".
2. `onDragMove`: compute the snapped candidate `{ date, start, end }`; render a
   placeholder in the grid at the candidate and a `DragOverlay` ghost sized to the
   duration; the original block stays in place; announce candidate changes (throttled).
3. `onDragEnd`: convert `{ date, start, end }` to instants with the profile timezone
   (`fromLocal`), run the mutation through `useOptimisticAction` (`scheduleTask`,
   `moveBlock`, or `resizeBlock`); announce the result.
4. `onDragCancel` (Escape, pointer leaves the window, focus lost): remove the placeholder
   and overlay; nothing was mutated. Because mutation happens only in `onDragEnd`, cancel
   is always a no-op on data.
5. Drag-to-create on empty space is **not** dnd-kit: it is a pointer-down/move/up handler
   on the column that selects a snapped span and then opens the create popover. Keeping
   it separate avoids conflicting sensor activation with block drags.

**Keyboard model** (Domain Rule 10; every item announced through `Announcer`):

| Pointer action               | Keyboard equivalent                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Drag block to a new slot     | Focus block → `M` → arrows move by snap/day, Shift+arrows by hour → Enter commits, Esc cancels |
| Resize block                 | Focus block → `R` → ↑/↓ adjust end; Shift+↑/↓ adjust start → Enter / Esc             |
| Drag task from the planning drawer | Focus task → Enter or `F` → Find Time (ranked candidates, one-click Schedule; "Pick a time instead" switches the same dialog to the manual picker) · `S` → manual slot picker (date + time + duration, defaults to today 09:00 and the estimate's length) → Enter |
| Click empty space            | Arrow keys move a grid cursor (visible cell outline) → Enter creates at the cursor    |
| Drag on empty space          | Grid cursor → Shift+↓ extends the selection → Enter creates the span                |
| Click block                  | Enter opens the block; `Space` toggles completion; `Delete` deletes (with undo toast) |
| Reorder tasks (sortable)     | Focus row → `Space` picks up → arrows → `Space` drops (dnd-kit sortable keyboard preset) |

Move and resize modes run through the same `KeyboardSensor`, so the announcements and
mutation path are shared with pointer drags.

**Timezone in the geometry.** The grid is laid out in the user's wall-clock day; on DST
transition days the day is 23 or 25 hours long and the grid still shows 05:00–24:00 rows.
A span is converted to instants with `fromLocal(date, minutes, tz)`; a start that falls
in a DST gap moves forward to the next valid instant, and one in an overlap takes the
first occurrence. Both cases are unit-tested.

**Performance.** The grid is a known-size structure: 7 columns × (19 hours) rendered as
positioned children of a column, not as 532 slot cells. Blocks are absolutely positioned
by `yFromMinutes`. Block components are memoized on their domain object; the drag
placeholder is the only thing that re-renders during a drag.

## 10. Timezone strategy

Concrete implementation of Domain Rule 4.

**Library and module.** `date-fns` 4 + `@date-fns/tz` (`TZDate`, `tz()`), used only inside
`@momentum/core/time`. Every function takes the timezone explicitly; none reads an ambient
default; `now` is injectable for tests.

```ts
// @momentum/core/time
instant(value: string): Instant             // validates and normalizes to trailing Z
localDate(value: string): LocalDate         // validates YYYY-MM-DD
nowInstant(clock?: () => number): Instant
localDateOf(i: Instant, tz): LocalDate
minutesFromMidnight(i: Instant, tz): number
fromLocal(date: LocalDate, minutes: number, tz): Instant   // DST gap → forward; overlap → first
startOfDay(date: LocalDate, tz): Instant
endOfDay(date: LocalDate, tz): Instant                     // = startOfDay(next day)
todayIn(tz, now: Instant): LocalDate
isSameLocalDay(a: Instant, b: Instant, tz): boolean
addDays(date: LocalDate, n: number): LocalDate
weekOf(date: LocalDate, weekStart: Weekday): { start: LocalDate; days: [LocalDate × 7] }
weekRange(date: LocalDate, weekStart: Weekday, tz): { start: Instant; end: Instant }
durationMinutes(start: Instant, end: Instant): Minutes
nextLocalMidnight(tz, now: Instant): Instant
formatTime(i, tz, { hour12 }) · formatTimeRange(a, b, tz) · formatLocalDate(d, style) · formatDuration(minutes)
```

**Where the timezone comes from.** `requireSession()` returns the profile, and every query
and action reads `profile.timezone`, `profile.weekStart`, and `profile.snapMinutes` from
it. The server passes the same three values into `UserSettingsProvider`; client code reads
them from `useUserSettings()`. The browser's own timezone
(`Intl.DateTimeFormat().resolvedOptions().timeZone`) is read in exactly two places: the
signup form, to suggest the profile value, and a non-blocking banner when it differs from
the profile ("This device is in America/Denver; Momentum is set to America/New_York").

**"Today" on the server.** Every `(app)` route is dynamic (it reads cookies), so a server
component calls `todayIn(profile.timezone, nowInstant())` per request. There is no cached
"today".

**Hydration.** Server and client render identical markup because:

1. Fixed instants are always formatted with the profile timezone passed explicitly, so
   `formatTime(block.startAt, tz)` is deterministic on both sides.
2. Anything that depends on the current time (current-time line, past/current/future
   styling, "Good morning", relative times, the timer) lives in a client component that
   uses `useNow(intervalMs)` — a `useSyncExternalStore` whose server snapshot is `null`.
   Those components render a neutral state first and the time-dependent state after
   mount. No `suppressHydrationWarning` anywhere except the `<html>` theme attribute.
3. Midnight rollover: `useMidnightRollover(tz)` schedules `router.refresh()` at
   `nextLocalMidnight(tz, now)` so Today and the week grid roll over without a reload.

**Storage.** `timestamptz` in, ISO with `Z` out (mappers normalize `+00:00` to `Z`);
`date` columns ↔ `LocalDate` strings. `new Date('2026-09-07')` is UTC midnight and is
never used for a `LocalDate`; parse with `fromLocal`/`startOfDay`.

**Tests.** Fixtures cover `America/New_York`, `Europe/London`, `Asia/Kolkata` (+05:30),
`Pacific/Auckland` (southern DST), `America/Santiago`, and `UTC`, on both DST transition
dates. The `core` Vitest project runs its suite twice via two projects with
`env: { TZ: "UTC" }` and `env: { TZ: "America/Los_Angeles" }` so any accidental dependence
on the process timezone fails.

**Rejected.** Reading the browser timezone for persisted logic; `Date.getTimezoneOffset()`
arithmetic; storing local timestamps; `Temporal`.

## 11. Recurrence strategy

**Decision.** A constrained custom model, expanded at query time, with overrides stored as
rows (Domain Rule 16). Only `event` blocks recur. Habits do not use recurrence at all:
their schedule is `activeDays` plus a weekly target, and "Add to week" writes real habit
block rows for one week.

```ts
interface Recurrence {
  freq: "daily" | "weekly";
  interval: number;                 // every N
  byWeekday: Weekday[] | null;      // weekly only; null = weekday of the first occurrence
  until: LocalDate | null;          // inclusive, in `timezone`
  count: number | null;             // alternative to until
  timezone: IanaTimeZone;           // wall-clock semantics are defined here, fixed at creation
}
```

Stored as `calendar_blocks.recurrence jsonb` on the series row, with `recurrence_until`
duplicated into a real `date` column for indexable window queries.

**Expansion** (`@momentum/core/recurrence`, pure):

```
expandSeries(series, window: { start: Instant; end: Instant }, overrides: EventBlock[]): Occurrence[]
  1. firstDate  = localDateOf(series.startAt, r.timezone); firstMinutes = minutesFromMidnight(series.startAt, r.timezone)
     duration   = durationMinutes(series.startAt, series.endAt)
  2. iterate candidate dates from firstDate by freq/interval/byWeekday, stopping at `until`, `count`,
     or one day past the window end in r.timezone (one-day margin absorbs timezone differences)
  3. for each date: startAt = fromLocal(date, firstMinutes, r.timezone); endAt = startAt + duration
  4. apply overrides keyed by occurrenceDate: cancelled → drop; otherwise use the override's fields
  5. keep occurrences that intersect the window; id = `${seriesId}:${occurrenceDate}`
```

**Editing.** "This occurrence" writes an override row (`series_id`, `occurrence_date`,
new times/title). "This and following" ends the series (`until = day before`) and creates
a new series starting at the edited occurrence. "All" edits the series row. Deleting one
occurrence writes a cancelled override; deleting the series cascades its overrides.

**Window query** (one query in the repository):

```
plain rows:     recurrence is null and series_id is null and start_at < :end and end_at > :start
series rows:    recurrence is not null and start_at < :end and (recurrence_until is null or recurrence_until >= :startDateMinus1)
override rows:  series_id is not null and occurrence_date between :startDateMinus1 and :endDatePlus1
             or series_id is not null and start_at < :end and end_at > :start
```

The second override predicate was added in Phase 3. An override may move its
occurrence to a different week, and then the date the *rule* produced is outside
the window while the block the user can see is inside it — so matching only on
`occurrence_date` loses the occurrence from both weeks at once: absent from the
new one because its rule date is elsewhere, and dropped from the old one because
`expandSeries` judges every occurrence on its overridden times.

**Rationale.** The product needs "weekly on Mon/Wed/Fri until June" and "every day";
nothing in the specs needs monthly, yearly, nth-weekday, or exclusion dates. A constrained
model is fully testable, expands deterministically, and keeps DST semantics explicit.

**Rejected.** `rrule` (RFC 5545 breadth the product never uses; timezone handling is
UTC/"floating"-centric and DST behaviour needs workarounds; a stored RRULE string cannot
be filtered in SQL). Materializing occurrences (write amplification, a horizon to manage,
and a series edit becomes a bulk rewrite). A separate `recurrence_exceptions` table (an
override is a block; keeping it in the same table keeps the window query and RLS single).

## 12. Authorization / RLS strategy

**Policy pattern** (every user-owned table; full matrix in `docs/DATABASE.md`):

```sql
alter table public.tasks enable row level security;
create policy "tasks: select own" on public.tasks for select to authenticated using (user_id = (select auth.uid()));
create policy "tasks: insert own" on public.tasks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "tasks: update own" on public.tasks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "tasks: delete own" on public.tasks for delete to authenticated using (user_id = (select auth.uid()));
```

`(select auth.uid())` rather than `auth.uid()` so the planner evaluates it once per
query. `anon` has no policies on any application table. Definition tables
(achievements, quests, cosmetics) are `select` for `authenticated` only and seeded by
migration. Ledger and lifecycle tables are `select` only; their writes go through
`security definer` functions (Domain Rule 15).

**Cross-row ownership.** A policy proves the row's `user_id` is the caller; it does not
prove that `task_id` on a block belongs to the same user. `before insert or update`
triggers (`assert_same_owner`) check every foreign key that crosses tables, so a crafted
request cannot attach a block to another user's task even though RLS would let it read
nothing back.

**Guarded columns.** Trusted functions set a transaction-local flag
(`set_config('momentum.trusted', 'on', true)`); `before update` triggers reject changes
to guarded columns (`profiles.xp/level/coins`, `tasks.status/completed_at/actual_minutes`,
`calendar_blocks.completed_at`, `weekly_goals.completed_at`) unless the flag is set.
This is what makes "XP is never client-asserted" true even for a client that bypasses
the app and talks to PostgREST directly.

**How `auth.uid()` flows.** The browser holds the Supabase session in cookies. `proxy.ts`
(Next 16's request proxy, Node runtime) refreshes the session on every navigation using
`@supabase/ssr` and redirects unauthenticated requests for `(app)` routes to `/login` —
an optimistic check. The real check is `requireSession()` in every query and action,
which builds the cookie-bound server client; the user's JWT is forwarded to PostgREST
and `auth.uid()` resolves inside Postgres.

**Service role.** The secret key is never imported by `apps/web`. It is used by
`supabase/seed.sql` (applied by the CLI) and by the integration-test harness to create
fixture users. No request path, action, or route handler ever uses it.

**Where trusted XP logic runs: Postgres functions, not Edge Functions.** The award must be
atomic with the state change it rewards (`complete_task` = status update + ledger insert
+ profile update in one transaction), must be idempotent under retry (ledger uniqueness),
must be unreachable except through the sanctioned path, and must read the user's
timezone for daily caps. A `security definer` function gives all four with no extra
runtime, no cold start, and one deployment artifact (the migration). **Rejected:** Supabase
Edge Functions (Deno runtime, non-transactional across calls, second deploy target, cold
starts on the hottest path); computing XP in server actions (correct in the happy path but
leaves the ledger tables writable by policy, which a direct PostgREST call could exploit).

## 13. Testing strategy

| Layer        | Tool                                 | Scope                                                                 | Command                    |
| ------------ | ------------------------------------ | --------------------------------------------------------------------- | -------------------------- |
| Unit         | Vitest (node)                        | `@momentum/core`: time, geometry, recurrence, scheduling, parser, gamification math, analytics aggregation; `@momentum/db` mappers | `pnpm test`                |
| Component    | Vitest (jsdom) + Testing Library     | `@momentum/ui` primitives' behaviour (keyboard, aria), feature islands' keyboard paths | `pnpm test`                |
| Integration  | Vitest project `db` against local Supabase | repositories, database functions, **RLS cross-user proofs**, XP idempotency and caps | `MOMENTUM_DB_TESTS=1 pnpm test` |
| E2E          | Playwright (`e2e/*.spec.ts`, system Chrome via `channel: "chrome"`, `reuseExistingServer`; a `mobile` project emulates an iPhone 13 in Chromium for `@mobile` specs; `e2e/fixtures.ts` exports `mail` — the Mailpit API: list, read, clear, `waitForMessage` — `linkTo` and `signInAs`) | the 18 audit workflows (Phase 13), password recovery and sign-up with email in the loop, signed in as the seed accounts against the local stack | `pnpm test:e2e`            |
| Static       | `tsc`, ESLint, Prettier              | types, architecture boundaries, formatting                            | `pnpm typecheck` `pnpm lint` |

**Commands (root).** `pnpm dev` · `pnpm build` · `pnpm typecheck` (root config, then
every package; the web app runs `next typegen` first) · `pnpm lint` (`eslint .` then
`prettier --check .`) · `pnpm test` (`vitest run` over all projects) · `pnpm test:watch`.
Phase 2 adds `pnpm db:reset` and `pnpm db:types`; Phase 3 adds `pnpm test:e2e`.

**Must be tested** (each item is an acceptance criterion somewhere in `specs/`): DST and
midnight-crossing boundaries; week boundaries for both week starts; snapping and
pixel↔time mapping; overlap layout; recurrence expansion with overrides; Find Time ranking
and its awkward cases; XP calculation, caps, and idempotency (including exploit attempts);
habit dedupe and consistency math; parser edge cases; analytics bucketing and sample-size
gating; RLS denial for a second user on every table.

**Must not be over-tested.** Markup of static pages; shadcn primitives' internals; styling;
snapshot tests of components.

**Conventions.** Tests sit next to code as `*.test.ts(x)`. Domain tests are pure and
fixture-driven (no mocks). Integration tests skip themselves cleanly when
`MOMENTUM_DB_TESTS` is unset so `pnpm test` stays green without Docker.

**Rejected.** Jest (Vitest shares Vite's transform and is faster with ESM). Cypress
(Playwright is the Next-recommended peer and covers keyboard testing well). Mocking
Supabase for repository tests (the value is in the real policies and functions).

## 14. Design system primitives

Specified in `docs/DESIGN_SYSTEM.md`: token scales (spacing, radii, typography, semantic
color + project palette, elevation, motion, layering, sizes), the shadcn components to
add, the Momentum primitives with their responsibilities, and which live in `@momentum/ui`
versus `apps/web/src/components`. Phase 1 implements exactly that list; new primitives go
into the list before they go into a page.

**Built in Phase 1.** All token scales, every shadcn base component, and every primitive
except `DurationInput`, `DatePicker`, `PrioritySelect` (Phase 4) and `XPToast`,
`AchievementToast` (built in Phase 8, alongside `ProfileFrame`) — each deferred to the phase that owns its data rather than
built against no consumer. `PageContainer` was added to the layout group: the page gutter
and section rhythm are a token decision, and were otherwise going to be repeated in every
route. `@momentum/ui` gained a dependency on `@momentum/core` for the reason `ProjectDot`
exists at all — the mapping from a `ProjectColor` to a token belongs in exactly one place,
and duplicating the union in the design system is the duplication the engineering rules
forbid.

Two behaviours are worth stating because they are easy to break:

- Tailwind cannot assemble a class name at runtime, so the project palette is written out
  as an exhaustive `Record<ProjectColor, string>` in `project-dot.tsx`. Adding a hue to
  `PROJECT_COLORS` without adding it there is a type error, and a test asserts the mapping.
- Duration and z-index have no Tailwind theme namespace. They are `@utility` declarations
  in `globals.css` (`duration-base`, `z-popover`, …), and the vendored shadcn components
  were edited to use them instead of the `z-50` they ship with.

## 15. Error handling and loading

- **Boundaries.** `app/global-error.tsx` (root), `app/(app)/error.tsx` (content area
  fails, shell survives), and a per-route `error.tsx` for `calendar` and `tasks` (the two
  heaviest surfaces). Section-level `ErrorBoundary` around independent panels (Plan panel,
  At Risk, Next Up) so one failing panel does not blank a page. Every boundary offers
  Retry (`reset()`), and reports through one `reportError()` (console in dev; a hook for
  an error service later — not a dependency now).
- **Loading.** `loading.tsx` per route renders that route's composite `Skeleton` built
  from the same layout components as the real page, so dimensions match and there is no
  layout shift. `<Suspense>` inside pages only around independent secondary panels.
- **Empty states.** Every list surface declares its `EmptyState` (icon, title, one line,
  one action) in the feature; no blank regions.
- **Pending states.** `pending` from `useOptimisticAction` disables the initiating control;
  `LoadingState` for panel-level refetches. Never a full-page spinner after first paint.
- **Toasts.** One API (`toast` from `@momentum/ui`), one visual style; errors always include
  the server message and, when retryable, a Retry action. `XPToast` and
  `AchievementToast` are the only custom renderers.
- **Not found / forbidden.** `notFound()` for missing ids; a row hidden by RLS is
  indistinguishable from a missing one, which is the intended behaviour.

---

## 16. The level curve (Phase 8)

**Decision.** Cumulative XP to reach level *L* is

```
xpForLevel(L) = floor(100 * (L - 1) ^ 1.5)
```

`level_for_xp()` and `xp_for_level()` in
`supabase/migrations/20260907140000_gamification_functions.sql` are the
implementation; `@momentum/core/gamification` mirrors it so the interface can
show progress without a round trip, and `packages/db/src/gamification-rules.test.ts`
reads the migration as text and fails if the two disagree. The base (100) and
the exponent (150, as a percentage) are `xp_rule()` tunables like every other
number in the system.

**Rationale.** specs/08-gamification.md asks for "1–5 quick, 5–20 moderate, 20+
progressively harder — not exponentially absurd; a level 40 user should still
level up sometimes." The last clause is the constraint that decides the shape.
An exponential curve fails it by construction: whatever base you pick, the cost
per level eventually outruns any amount of real work, and progression quietly
stops meaning anything to the people who have used the product longest. A
power curve with an exponent between 1 and 2 grows the *per-level* cost with
`L ^ 0.5` — it keeps getting harder, and it never stops being reachable.

`1.5` and `100` were chosen against the product's own earning rates rather than
by feel. A task is ~10 XP, a focused minute is ~1 XP capped at 300 a day, a
daily quest is 15–20, and the per-source daily caps bound a very good day at
roughly 500 XP. So:

- **Level 2 costs 100** — about ten tasks, or a first focus session. The first
  level arrives on the first day, which is when it means the most.
- **Levels 1–5 cost 800 in total** — a couple of committed days.
- **Level 10 is 2,700**, **level 20 is 8,281** — weeks, then a couple of months.
- **Level 40 costs 943 XP** — two or three good days for one level, still.

**First thirty thresholds.** "Total XP" is the cumulative amount that level
requires; "cost of this level" is the difference from the one before it.

| Level | Total XP | Cost of this level |     | Level | Total XP | Cost of this level |
| ----: | -------: | -----------------: | --- | ----: | -------: | -----------------: |
|     1 |        0 |                  — |     |    16 |    5,809 |                571 |
|     2 |      100 |                100 |     |    17 |    6,400 |                591 |
|     3 |      282 |                182 |     |    18 |    7,009 |                609 |
|     4 |      519 |                237 |     |    19 |    7,636 |                627 |
|     5 |      800 |                281 |     |    20 |    8,281 |                645 |
|     6 |    1,118 |                318 |     |    21 |    8,944 |                663 |
|     7 |    1,469 |                351 |     |    22 |    9,623 |                679 |
|     8 |    1,852 |                383 |     |    23 |   10,318 |                695 |
|     9 |    2,262 |                410 |     |    24 |   11,030 |                712 |
|    10 |    2,700 |                438 |     |    25 |   11,757 |                727 |
|    11 |    3,162 |                462 |     |    26 |   12,500 |                743 |
|    12 |    3,648 |                486 |     |    27 |   13,257 |                757 |
|    13 |    4,156 |                508 |     |    28 |   14,029 |                772 |
|    14 |    4,687 |                531 |     |    29 |   14,816 |                787 |
|    15 |    5,238 |                551 |     |    30 |   15,616 |                800 |

Beyond the table: level 40 is 24,355 total (943 for that level) and level 50 is
34,300 (1,055). The cost per level passes 1,000 XP at level 46 and is still
under 1,500 at level 100.

**Floating point does not decide a level.** `level_for_xp` computes the analytic
inverse and then walks to the level the *thresholds* agree with, in both
directions. A user one XP short of level 12 is shown level 11 however `power()`
rounds, and the same correction is written into the TypeScript mirror. A test
asserts the inverse at every boundary and at every boundary minus one.

**Rejected.** An exponential curve (`base * r ^ L`): fails the "level 40 user
still levels up" requirement, which is the one thing the spec is emphatic
about. A linear curve (`k * L`): the hundredth level costs what the second did,
so the number stops carrying information. A hand-written table: thirty numbers
to maintain in three places, and no answer at level 31.

---

## 17. Conventions settled by the Phase 13 audit

Recorded here because each is a cross-cutting rule a later phase could accidentally
re-decide; the rationale and the findings are in `docs/ROADMAP.md` ("What exists after
Phase 13").

- **§8, failure path.** Every mutation that can reject takes the `useOptimisticAction` path
  (rethrow framework throws, report, `unavailable`, toast with Retry); a `validation` result
  gets no Retry and its first field message; forms render `fieldErrors` beside the field.
- **§15, live regions.** The `Announcer` is literally the single live region: sonner's is
  off, `toast.success/error/info` announce through a module-level bridge the provider
  registers, `toast.xp`/`celebrate` announce nothing (the caller that knows the event does).
  An error toast with an action persists until dismissed and is reachable under a modal.
- **§9, pointer geometry and sensors.** The calendar resolves drops from its own pointer
  tracking (`pointer.y − over.rect.top`), never from dnd-kit's scroll-adjusted `delta`;
  sensors are `MouseSensor` (4px) + `TouchSensor` (200ms hold, 8px tolerance) with
  `touch-manipulation` on block shells. Keyboard move/resize announce after the write lands.
- **§5, narrow viewports.** The Plan-my-week `SidePanel` becomes a `SideSheet` below `lg`
  (`useWideViewport`, `matchMedia("(min-width: 64rem)")`, server snapshot "wide").
- **Focus hand-off.** `useOpenerFocus(open)` restores focus in the closing commit;
  `tabbableNeighbours`/`focusFirstAvailable` pick a landing spot when the opener is gone. A
  menu item that opens a surface runs from the menu's `onCloseAutoFocus`.
- **Touch targets** live in `@momentum/ui` (`pointer-coarse:` variants), see
  `docs/DESIGN_SYSTEM.md` › Sizes.
- **Auth recovery** uses a `token_hash` email template (`supabase/templates/recovery.html`)
  so the link is not bound to the requesting browser's PKCE cookie.
- **Projects are non-optimistic.** Their rows are read by the `(app)` layout, so every project
  action `refresh()`es and the sidebar, Quick Add's picker and the palette index update together;
  the actions still take the full failure path (transition, `unstable_rethrow`, report,
  `unavailable`; inline error with Retry inside `ProjectDialog`, toast with Retry outside). The
  palette's "New project" follows the habits pattern: an intent in the URL (`/tasks?new=project`)
  honoured once by the page.
- **One browser notification.** `useFocusTimer` exposes `onPlannedTimeElapsed` (once per session,
  on the reading where the countdown crosses zero); the focus view shows it on the ring when the
  page is visible and calls `notifyFocusEnded` when it is hidden. `lib/notifications` is the
  function a future platform capabilities layer wraps, not replaces. The top bar has no bell: a
  control that does nothing is not rendered.
- **/focus reads its URL** through `features/focus/search-params.ts`, keyed as the launchers
  write it (`task`, `minutes`).

## Platform implications: PWA (Phase 12) and desktop (Phase 15)

The web app is server-rendered; there is no static export. Consequences decided now so
later phases do not fork:

- **Desktop = remote content.** The Tauri main window loads the deployed app URL; the
  menu-bar timer and global quick-add windows load small routes of the same deployment
  (`/desktop/menubar`, `/desktop/quick-add`). Tauri 2 capabilities must allow IPC for
  that remote origin; this is the configured, documented path, not a hack.
- **Capabilities layer.** `apps/web/src/lib/platform/` defines
  `interface PlatformCapabilities { notify; setMenuBarTimer; registerGlobalShortcut; setBadge; openExternal }`
  with a web implementation (Web Notifications where allowed, otherwise no-ops). The
  desktop implementation detects the Tauri bridge at runtime and is injected through a
  provider. Shared code calls the capability; it never branches on platform (Domain Rule
  18).
- **PWA.** The service worker caches the app shell and static assets only; it never
  caches server-action or route-handler responses. Offline mutations fail through the
  normal `ActionResult` path with code `unavailable`, which the optimistic mechanism
  already surfaces (§8). _(Phase 12 sharpened "app shell" to mean the content-hashed
  assets and nothing else: **no HTML is cached**, because every application route is
  per-user and cookie-dependent, and a cached document is both one user's data on disk and
  the way a deploy fails to arrive. See the four Phase 12 entries in the decisions log.)_

---

## Where the specs and this architecture disagree

Each was resolved in Phase 0; the spec text stands, read with these notes.

| Spec says                                                              | Resolution                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `docs/DATABASE.md` sketch: `calendar_events` with `event_type`         | Table is `calendar_blocks` with `kind` (matches the glossary; events are one kind of block).    |
| `docs/DATABASE.md` sketch: `daily_quests` / `daily_quest_progress`     | `quest_definitions` + `quest_assignments`; progress is derived from existing rows, never stored.|
| `docs/DATABASE.md` sketch: `focus_sessions.completed` boolean          | `status` enum (`running` / `paused` / `completed` / `abandoned`) plus `focus_pauses`.           |
| `packages/README.md`: eight packages                                   | Three (`core`, `db`, `ui`) with subpath modules; see §2.                                        |
| `supabase/README.md`: `functions/` for edge functions if chosen        | Not chosen; trusted logic is SQL in migrations. The directory was removed.                      |
| Spec 04: "tags (if the architecture supports them)"                    | Not in v1. Projects + priority cover grouping; tags need a join table, RLS, and UI for no MVP story. |
| Spec 03/04, runbook: Phase 4 may have to migrate a single-block model  | Did not happen, as predicted: the schema is multi-block from the first migration and `tasks` has no schedule columns. Phase 4 shipped `packages/db/src/work-block-model.test.ts`, which reads every migration and fails any that adds one. |
| Spec 15: "wraps the shared frontend"                                   | Wraps the **deployed** frontend (remote content); see the platform section above.               |
| Spec 07: timer "persist `started_at` and pause records"                | Persisted by database functions with `now()`; the client cannot supply either timestamp.        |
| Spec 08: "profile total reconciles against the ledger"                 | A trigger maintains the total; `reconcile_xp()` exists for audit and repair.                    |
| Spec 12: "cached read data may be displayed"                           | Only the RSC payload the router already holds; the service worker adds no data cache of its own.|

---

## Architectural decisions log

| Date       | Decision                                                                 | Rationale (short)                                                   | Rejected                                    |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------- |
| 2026-09-06 | pnpm workspaces, source-consumed packages, no Turborepo                  | Testable domain, enforceable boundaries, no build graph to manage    | single app; compiled packages; turbo now    |
| 2026-09-06 | Packages: `core`, `db`, `ui`; modules via subpath exports                | Boundaries where deps/environments differ                            | eight packages; config package              |
| 2026-09-06 | Schema → generated types → hand-written domain types, explicit mappers   | Decouple app from columns; unions the DB cannot express              | using generated types directly              |
| 2026-09-06 | `Instant`/`LocalDate` branded strings; ids plain strings                 | Serialization-stable; catches the real bug class                     | `Date` in domain; branded ids               |
| 2026-09-06 | One `calendar_blocks` table with `kind`; no schedule columns on tasks    | One range query, one DnD path, one RLS policy; multi-block from day 1| separate work_blocks table; table inheritance |
| 2026-09-06 | Server components default; enumerated client islands                    | Reads are server-rendered; interaction is leaf-level                 | client fetching; Cache Components in v1     |
| 2026-09-06 | Reads in `queries.ts`, mutations in server actions, `ActionResult` envelope, `refresh()` | One auth path, progressive enhancement, typed failures   | route handlers for mutations                |
| 2026-09-06 | No client cache library, no global store                                 | Nothing to cache that props do not already carry                     | TanStack Query; Zustand                     |
| 2026-09-06 | `useOptimisticAction` on `useOptimistic` + client-generated ids          | One rollback path, idempotent retries                                | per-feature revert code; offline queues     |
| 2026-09-06 | _(Phase 1, revises §7)_ Sidebar collapse persists in a cookie, not `localStorage` | The `(app)` layout reads it on the server, so the first paint is already the right width. `localStorage` is readable only after hydration, which means either a frame at the wrong width or a pre-hydration inline script plus a second source of truth for the same state. These routes are cookie-dependent from Phase 2 regardless. | `localStorage` + inline script; no persistence |
| 2026-09-06 | _(Phase 1)_ `@momentum/ui` may import `@momentum/core` | `ProjectDot` is specified as the one place a `ProjectColor` maps to a token, so it needs the union. Type- and enum-only, one direction, still framework-free. | duplicating `PROJECT_COLORS` in `ui` |
| 2026-09-06 | dnd-kit core; column droppables; pure geometry in core; keyboard via same sensor path | Highest-risk surface designed once                       | per-slot droppables; `@dnd-kit/react` 0.x   |
| 2026-09-06 | date-fns 4 + `@date-fns/tz` behind `@momentum/core/time`; `useNow` for time-dependent UI | Domain Rule 4 with no hydration mismatches           | browser tz; `Date` arithmetic; Temporal     |
| 2026-09-06 | Constrained recurrence, query-time expansion, overrides as rows          | Covers every spec case; DST explicit; SQL-filterable                 | `rrule`; materialized occurrences           |
| 2026-09-06 | RLS on all tables; ledgers client-read-only; trusted writes via `security definer` SQL functions with a trusted-flag guard | Correct even against direct PostgREST calls | Edge Functions; XP in server actions |
| 2026-09-06 | Vitest projects + Playwright; integration suite gated by env             | One runner; RLS proven, not asserted                                 | Jest; Cypress; mocked Supabase              |
| 2026-09-09 | Phase 13 conventions (§17): one failure path, one live region, pointer-tracked drops, touch targets in the primitives, Plan drawer as a sheet below `lg`, token-hash recovery | Nine focus-on-`<body>` findings and two blanked routes came from re-deciding these per feature | Per-feature reverts, per-feature announcers, per-button touch sizing |
| 2026-09-06 | TypeScript 6.0.3, ESLint 9.39.5 (see version notes)                      | Latest that the toolchain supports together                          | TS 7; ESLint 10                             |
| 2026-09-06 | shadcn `radix-nova` on Radix primitives                                  | Most documented primitive set; swappable per component               | Base UI (`base-nova`); React Aria           |
| 2026-09-06 | Desktop shell loads the deployed app (remote content)                    | Server components cannot run inside Tauri                            | static export; sidecar server               |
| 2026-09-06 | No tags in v1                                                            | No MVP story; cost is a table + RLS + UI                             | tags table                                  |
| 2026-09-06 | _(Phase 3, revises §10)_ `@momentum/core/time` is built on `Intl.DateTimeFormat`, not date-fns 4 + `@date-fns/tz` | `TZDate`'s gap/overlap disambiguation is not the rule this product needs (forward on a gap, first occurrence on an overlap), so it would have been overridden anyway. Going direct reads the same tz database in ~15 lines of `fromLocal` and writes the rule out where it can be read. Both packages are dropped from `@momentum/core`; an unused declared dependency tells the next reader the module is built on something it is not. | keeping the deps unused; `TZDate` plus overrides |
| 2026-09-06 | _(Phase 3, revises §9)_ No dnd-kit `KeyboardSensor`; keyboard move and resize are explicit `M` / `R` modes | §9's own keyboard table assigns Space and Enter to "toggle completion" and "open the block", which are exactly the keys `KeyboardSensor` activates on, and the sensor cannot express Escape-cancels-a-mode or a per-edge resize. The modes produce the *same* `DaySpan` through the *same* pure helpers and commit through the *same* callbacks, which is the property the shared sensor existed to guarantee. | `KeyboardSensor` with a custom `coordinateGetter`; a second key for activation |
| 2026-09-06 | _(Phase 3)_ The grid's window is 05:00–24:00 by default and grows to fit the week's blocks | specs/03 asks for "roughly 5:00 AM – 12:00 AM", which is the right default and the wrong hard limit: a 04:30 block or a shift ending at 02:00 would not be on the calendar at all. `resolveGridSpec` widens to the containing hours and `initialScrollMinutes` opens on the working day, so nothing is hidden and the common week still looks like the spec's sketch. | a fixed window that clips; always rendering 24 hours |
| 2026-09-06 | _(Phase 3)_ Block create and edit are a `SideSheet`, not the popover specs/03 names | docs/DESIGN_SYSTEM.md already lists `SideSheet` for "task detail, **block edit**", and a popover anchored to an absolutely-positioned block inside a scrolling grid moves with the grid, is clipped by it, and covers the time the user is reading. | a popover with `PopoverAnchor`; a modal dialog |
| 2026-09-06 | _(Phase 3)_ Server actions take a wall-clock `{ date, startMinutes, endMinutes }`; the client never asserts an instant | The profile timezone is the server's, and `fromLocal`'s DST gap/overlap rule then lives in exactly one place. A client that sent instants would be asserting a timezone conversion the server is responsible for. | sending `Instant`s from the drag handler |
| 2026-09-06 | _(Phase 3, revises §8's example)_ One optimistic overlay over the item list, driven by patches — not one `useOptimistic` per action | The calendar has seven mutations over one array. Seven hooks would each hold a different view of that array and the grid can only render one. The mechanism is unchanged: apply → persist → reconcile → roll back, with the reducer pure and testable in `features/calendar/optimistic.ts`. | a hook per action; per-feature `useState` + manual revert |
| 2026-09-06 | _(Phase 3)_ `complete_task` / `uncomplete_task` ship now as state transitions only | Domain Rule 13's "Complete task" control is a Phase 3 acceptance criterion, and the guarded columns have no other sanctioned path. `xp_rule()` and `evaluate_achievements()` are Phase 8's and the level curve is Phase 8's to finalise; inventing an XP amount would be guessing at a number Domain Rule 6 makes the server's single source of truth. The functions are the sanctioned path from today, so adding the award later changes no caller. | inlining the task update in `complete_block`; a placeholder XP amount |
| 2026-09-08 | _(Phase 12)_ The service worker caches no HTML, only content-hashed `/_next/static` plus the offline page and icons | The platform section above already said the worker "never caches server-action or route-handler responses"; Phase 12 found that page HTML belongs in the same sentence. Every application route is per-user and cookie-dependent (§5), so a cached document is one user's rows sitting in Cache Storage on a possibly shared device, and it is also the mechanism by which a deploy fails to reach someone. Network-first would still hold a copy; caching nothing holds none. What the spec calls "the app shell cached for offline launch" is therefore the *assets*, and an offline launch shows the designed offline page — which is what "launches offline and explains its state clearly" asks for, and all this product can honestly do with no local store. | caching navigations network-first; a stale-while-revalidate shell; precaching route HTML |
| 2026-09-08 | _(Phase 12)_ The worker is versioned by its registration URL (`/sw.js?v=<build>`), not by its contents | The update path is the phase's stated risk, and it needs a value that changes exactly once per deploy and is identical across every client and server instance in that deploy. `next.config.ts` resolves it (commit SHA, else `git rev-parse`, else a timestamp) and `env` inlines it at build time, so it is frozen into the output rather than read from a process at runtime. Registering a new URL is what makes the browser install a byte-identical `public/sw.js` again, which is what re-precaches that build's offline page and re-names its caches. | a build-time codegen step that writes the version into `sw.js`; a route handler that computes it per request (different per instance); no version at all |
| 2026-09-08 | _(Phase 12)_ A waiting worker is offered, never auto-activated | `skipWaiting()` on install swaps the worker under a page that is mid-session, and the reload that has to follow it lands on whatever the user was doing — a drag, a focus session, a half-typed task. The toast does not expire, so the offer cannot be missed, and `controllerchange` reloads only when the page already had a controller: the first worker claiming an uncontrolled page is not an update. | `skipWaiting()` in `install`; a silent reload; leaving the update until the next cold start |
| 2026-09-08 | _(Phase 12)_ The offline page is a static, self-contained `public/offline.html`, not a route | It is the one surface that must render with no network at all. A Next route's HTML depends on a content-hashed CSS chunk that may not be in the cache, on a webfont, and on the router — none of which can be guaranteed at the moment it is needed. The cost is seven design-token values written as literal hex in one file, which is the same cost `<meta name="theme-color">` and the manifest already pay for the same reason. | an `app/offline/page.tsx` precached by URL; rendering the app shell from cache |
| 2026-09-08 | _(Phase 12)_ A `/version` route handler, polled by the client, is what detects a deploy | `registration.update()` re-fetches the URL the worker was registered under, and `public/sw.js` is byte-identical across builds, so it answers "unchanged" however many deploys have happened. Next 16 does not close the gap either: a soft navigation fetches an RSC payload, not a document, so a tab open for a day keeps running the bundle it loaded with and never re-reads the script tag that carries the new stamp. Asking the server for its build is the only signal that is actually about the deployment; when it differs, the client registers that build's worker URL and the existing install → prompt → reload path does the rest. This is the sanctioned use of a route handler in §6 — a non-RSC consumer — and `proxy.ts` exempts it so the sign-in screen can ask too. | relying on `update()`; `NEXT_DEPLOYMENT_ID`; a version in the manifest; forcing a document load on every navigation |
| 2026-09-06 | _(Phase 3, extends Domain Rule 13)_ Un-completing a block reverses exactly what completing it did | Rule 13 fixed the completing direction and was silent on the reversing one, so a control could complete a task and leave the user with no way to undo it until Phase 4 exists. `uncomplete_block(id, also_uncomplete_task)` mirrors `complete_block`, and the caller carries the flag so the label and the effect are decided in the same place. | inferring it inside the function; leaving the task completed |
| 2026-09-06 | _(Phase 3)_ A block that crosses midnight renders in both day columns but is not draggable or resizable | Each column shows a clipped half, and committing a drag from a half would rewrite the block to the length of that half — real data loss for a gesture that looks routine. Such blocks stay focusable, openable, completable and deletable, and their times are edited in the block editor, so no capability is lost. | dragging the visible half; hiding the continuation; a whole-block duration on the segment |
| 2026-09-07 | _(Phase 5)_ `@momentum/core/scheduling` works in instants and elapsed minutes; wall clock enters only at the edges (`toDayInterval`, `slotOf`, `intervalOfSlot`) | Capacity is "how much of the week is left", which only adds up in elapsed time: a 09:00–17:00 window is eight hours every day, but a block across a transition is not its clock length (Domain Rule 3, §10). The action boundary is wall clock, so a Find Time candidate is converted with the server's own rule and scored as the block that will be written; a reading that would not round-trip is not offered. | minutes-from-midnight maths (an hour out twice a year); instants end to end (the actions take wall clock) |
| 2026-09-07 | _(Phase 5)_ Find Time treats overlap as a filter first and a ranking criterion second | specs/05 ranks "within working hours" above "minimal conflicts", which read literally would suggest a double booking inside working hours over a free evening. An open slot outside working hours beats an overlapping one inside them; overlapping candidates are offered only when no open slot in the range fits, ranked by fewest overlaps and named in the explanation. Recorded in docs/SCHEDULING.md §5 and §7. | the literal order; never suggesting overlaps (a fully booked week would return nothing) |
| 2026-09-07 | _(Phase 5)_ Ranking is lexicographic over the five criteria; nothing is weighted or summed | Every ordering is explainable by the first field on which two candidates differ, which is what the plain-language explanation needs; a weighted score is a number nobody can argue with. Ties fall to the earlier start, and at most two candidates per day are returned while other days have any. | weighted sum; tuned weights |
| 2026-09-07 | _(Phase 5)_ Off-hours suggestions are limited to 07:00–22:00 (`SUGGESTION_WINDOW`); configured working windows are honoured wherever they lie | A 00:15 slot is a valid free interval and a useless suggestion; a night worker's configured window is still their working hours. It is the engine's one tunable. | the grid's 05:00–24:00 window; no limit |
| 2026-09-07 | _(Phase 5)_ AVAILABLE counts today in full and is not clock-based; Find Time and the insufficient-time check take `now` | The server renders the capacity lines and the client's first paint must match them (§10); the "~" prefix is the acknowledgement that part of today may be gone. The two checks that genuinely need the hour run on interaction, after hydration, over an injected instant. | `useNow`-driven capacity (hydration mismatch or a flash) |
| 2026-09-07 | _(Phase 5)_ PLANNED sums every commitment that occupies time, block by block; AVAILABLE subtracts merged coverage | Everything competes for the same week (docs/PRODUCT.md), so events count as planned time; two overlapping blocks are two claims on an hour, but a minute cannot be freed twice. Domain Rule 13's settled blocks and all-day items occupy nothing (`occupiesTime`). | work blocks only; merging planned time (hides the double booking the overlap warning names) |
| 2026-09-07 | _(Phase 5)_ Capacity, conflicts and Find Time run on the client over the optimistic week; the server sends sections plus each task's coverage outside the range | "Totals update live during planning" is only true if the numbers derive from the same list the grid renders and roll back with it. The functions are pure and identical on both sides; `scheduledOutsideMinutes` is what the client cannot see, and the range's own blocks are summed live so an in-flight block is counted exactly once. | server-computed totals (right until the first drag, stale after it) |
| 2026-09-07 | _(Phase 5)_ Insufficient-time warnings are bounded to deadlines inside the displayed range | The client holds the range's blocks and nothing else; a deadline beyond the range would be judged against free time the engine cannot see and would warn falsely (or reassure falsely). Multi-week planning is a non-goal. | fetching future weeks |
| 2026-09-07 | _(Phase 5)_ A task appears in exactly one drawer section: OVERDUE → DUE THIS WEEK → UNSCHEDULED, decided on the server; subtasks are excluded | One row per task, and dnd-kit ids must be unique inside one `DndContext`. A subtask is scheduled through its parent, as the task manager's views already assume. | listing a task under every section it qualifies for |
| 2026-09-07 | _(Phase 5)_ HABITS is omitted from the drawer; WEEKLY GOALS is read-only | Phase 6 has not shipped; Phase 8 owns goal progress and claiming. The drawer lists the week's goals from the table the seed populates and adds no progress. | placeholder sections |
| 2026-09-07 | _(Phase 5)_ "Pick a time instead" swaps content inside one Radix dialog rather than closing one and opening another | Radix restores focus on a macrotask, so a close-and-open in one event captures `<body>` as the second dialog's opener and strands a keyboard user on close (Domain Rule 10). `ScheduleTaskContent` is exported for this; `ScheduleTaskDialog` still wraps it for the `S` route. | two dialogs |
| 2026-09-07 | _(Phase 8)_ Level curve `floor(100 * (L - 1) ^ 1.5)`, documented in §16 with thirty thresholds | The one requirement the spec is emphatic about — "a level 40 user should still level up sometimes" — rules out an exponential curve outright, and a linear one stops carrying information. A power curve between 1 and 2 keeps getting harder without ever becoming unreachable; the constants were fixed against the product's own earning rates and daily caps, not by feel. | exponential; linear; a hand-written table |
| 2026-09-07 | _(Phase 8)_ Daily XP caps live in a `before insert` trigger on `xp_events`, not in each awarding function | Domain Rule 6 makes anti-farming part of the calculation. Putting it at the ledger means a source added by a later phase is capped by default and the rule cannot be forgotten at a call site — and it let Phase 7's `finish_focus_session` keep its own tested body rather than being rewritten for symmetry. An award trimmed to nothing is dropped rather than written as a zero. | a cap in every function; a nightly job; no cap on tasks and habits |
| 2026-09-07 | _(Phase 8)_ Achievements are evaluated by statement triggers on `tasks`, `calendar_blocks`, `focus_sessions` and `habit_completions` — not on `xp_events` | Watching the ledger would have been one trigger with a hole in it: a habit whose reward is zero, and a ninety-minute session finished after the day's focus cap was full, both do real work and mint no ledger row. Statement-level with transition tables so planning a week is one evaluation, not twenty; skipped entirely when there is no `auth.uid()`, so the seed decides its own state. | a row trigger on `xp_events`; calling it from each function; a client-called RPC |
| 2026-09-07 | _(Phase 8, revises docs/DATABASE.md)_ Quest selection is a date-plus-account rotation, not `order by md5(...)` | `@momentum/core/gamification` owns quest selection for display (§2) and the spec requires a unit test of the determinism, so the rule has to be expressible in TypeScript that runs in a browser — which an md5 ordering is not, without shipping a hash implementation for it. The rotation is four lines in both languages, equally deterministic, and moves the set day to day instead of pinning one account to one ordering for ever. | md5 ordering (SQL-only); shipping an md5 to the client |
| 2026-09-07 | _(Phase 8)_ A weekly goal's XP award is keyed on `(user, week, metric)`, not on the goal's row id | `weekly_goals` is the one claimable thing a client can delete and recreate, so an award keyed on the row id would be mintable again on every recreate. The key is the goal's natural one, which `weekly_goals_uniq` already declares — the same reasoning as `habit_completion_id` in Phase 6. Coins ride on the ledger accepting the XP row, so they are idempotent for free. | keying on the row id; a claim ledger of its own |
| 2026-09-07 | _(Phase 8)_ `cosmetic_definitions.available`; only profile frames are for sale | The spec asks for the cosmetic architecture plus one minimal collection, and Phase 2 seeded five definitions across four kinds. A shop that took coins for something the product does not draw would be the worst possible version of this feature, and deleting the other rows would throw away reference data a later phase re-adds. | selling all five; deleting the unimplemented rows; four collections in this phase |
| 2026-09-07 | _(Phase 8, corrects §12)_ The function exposure matrix is revoked and granted **by name**, never by default privileges | The first live application of these migrations showed `alter default privileges ... revoke execute on functions` reaching nothing created after it: every function Phases 6, 7 and 8 added was executable by `authenticated`, including `award_xp`, which takes the amount as an argument. An explicit revoke is observably honoured; a default-privileges revoke is not, and Domain Rule 6 may not rest on the difference. The list is now asserted against the live catalogue as well as the migration's text. | relying on default privileges; per-phase revokes only |
| 2026-09-07 | _(Phase 8)_ No optimistic overlay on the progression surface | Every mutation there is a *server decision*: whether a quest is finished, what it is worth, whether the coins are there. An optimistic "+20 XP" would be the client asserting an amount one frame before the server decided it, which is the shape Domain Rule 6 exists to prevent. Each control waits for the row; failures surface with the server's own message, and every action is idempotent so the retry is safe. | `useOptimisticAction` on claims and purchases |
| 2026-09-07 | _(Phase 5)_ Settings persist through one partial-patch action, `updateProfileSettings`, one field per write | The page needed working hours and focus windows to persist; the same action covers the other fields and closes the Phase 2 known issue. Overlapping windows are merged to a canonical sorted list by the schema rather than rejected, because the capacity maths treats them as one window anyway. | persisting only the two new fields; rejecting overlaps |

---

## Risk register

| Risk                                   | Why it is risky                                                | Mitigation in place                                                              |
| -------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Calendar drag-and-drop                 | Hardest interaction to retrofit; keyboard parity easy to lose  | §9 designed before code; geometry pure and tested; one sensor path for both modes |
| Task ↔ work block modeling             | Wrong shape is the most expensive later fix                    | `calendar_blocks` with `kind`; schedule columns on `tasks` forbidden in writing   |
| Timezone correctness                   | Subtle, data-corrupting, found late                            | §10; explicit tz everywhere; dual-TZ test runs; branded scalars                   |
| Recurrence                             | Over- or under-engineered                                      | §11 constrained model; overrides as rows; expansion tested against DST            |
| Server-side XP                         | Must be trusted, idempotent, farm-resistant                    | §12 SQL functions + guarded columns + ledger uniqueness + caps in one place       |
| Calendar render performance            | Naive grids produce thousands of nodes                         | §9: column droppables, positioned blocks, memoized block components              |
| Hydration mismatches on time-dependent UI | Flicker, React warnings, wrong "today"                       | §10 `useNow` pattern; no time-dependent markup in server output                  |
| Toolchain drift (TS 7, ESLint 10)      | Lint or typecheck breaks on a routine upgrade                  | Versions and the reason they are held are recorded above; catalog pins them      |
| Slow external volume                   | `next dev` warns the repository is on a slow filesystem        | Known; move the checkout to a local disk if compile times become a problem       |
