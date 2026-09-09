# Phase 0 — Foundation & Architecture

**Model:** Fable 5.1 · **Effort:** xhigh · **No feature code in this phase.**

## Objective

Establish the architecture, domain model, database schema, and project scaffold that every
subsequent phase builds on. The goal is to resolve architectural contradictions *now*,
while they cost a document edit, rather than after 30,000 lines of code exist.

You are the principal engineer and product designer for this application. Think
architecturally before writing components.

## Read first

`CLAUDE.md` · `AGENTS.md` · `docs/PRODUCT.md` · `docs/DOMAIN_RULES.md` ·
`docs/DESIGN_SYSTEM.md` · every file in `specs/` (skim, so the architecture accounts for
all planned phases) · `docs/ARCHITECTURE.md` and `docs/DATABASE.md` (the skeletons you are
filling in).

## Requirements

### 1. Inspect and scaffold

Inspect the repository. Then create the minimal working scaffold:

- Package manager and workspace configuration (pnpm is available)
- Next.js app at `apps/web` with TypeScript in strict mode
- Tailwind + shadcn/ui initialized
- ESLint + Prettier configured and agreeing with each other
- Test runner configured with one trivial passing test
- `.env.example` documenting every variable the app will need
- Scripts wired at the root: `typecheck`, `lint`, `test`, `build`, `dev`

Use the latest stable mutually-compatible versions. **Verify compatibility at install time
rather than pinning versions from memory.** Record the resolved versions in
`docs/ARCHITECTURE.md`.

The scaffold must actually run. `pnpm dev` serves a page; `pnpm typecheck` and `pnpm lint`
exit 0.

### 2. Resolve every OPEN item in `docs/ARCHITECTURE.md`

Each of the 15 numbered items gets a decision, a rationale, and the alternatives you
rejected. Specifically and non-negotiably:

- **Repository shape** — monorepo vs. single app, and the tooling. A Tauri desktop shell is
  planned (Phase 15); decide whether that justifies the monorepo cost now or later.
- **Directory architecture** — the full tree, and what belongs where.
- **Domain model** — TypeScript types for every entity; their relationship to generated
  database types; which is the source of truth.
- **Server/client boundaries** — default server. Enumerate what must be a client component.
- **Data access layer** — the repository pattern. Server actions vs. route handlers, and
  when each applies. No Supabase calls in components, ever.
- **Client state** — the minimum that genuinely requires it. Justify any global store
  before adding one. Pick one server-cache approach and commit.
- **Optimistic updates** — one shared apply → persist → reconcile → roll back mechanism.
- **Drag-and-drop scheduling** — dnd-kit sensors, collision detection, the pixel ↔ time
  mapping, 15-minute snapping, cancellation, and the keyboard-equivalent model. This is the
  riskiest surface in the product. Design it here.
- **Timezone strategy** — the concrete implementation of Domain Rule 4, including how
  server components resolve "today" and how the client avoids hydration mismatches on
  time-dependent rendering.
- **Recurrence** — RRULE vs. a constrained custom model; where expansion happens;
  how exceptions are represented. Choose the simplest thing that supports habits and
  repeating classes.
- **Authorization / RLS** — the policy pattern for every table; where trusted server-side
  XP logic runs (database functions vs. edge functions).
- **Testing strategy** — layers, tools, what must be tested, and the exact commands.

### 3. Design the schema

Fill in `docs/DATABASE.md` completely: tables, columns, types, enums, constraints, indexes,
foreign keys with deliberate cascade behavior, and the RLS policy for each table.

**The single most important schema decision:** how work blocks relate to tasks
(Domain Rule 2). A task must be able to own multiple work blocks. Decide whether work
blocks are a discriminated row type in `calendar_events` or a separate table — either is
acceptable, ambiguity is not — and write down why.

Do not write migrations in this phase. Phase 2 implements them.

### 4. Design-system primitives

Propose the primitive component list (see `docs/DESIGN_SYSTEM.md`) and the token scales, so
Phase 1 implements rather than invents. Do not build them yet.

### 5. Documentation

Complete or update:

- `docs/ARCHITECTURE.md` — every OPEN item resolved, banner removed
- `docs/DATABASE.md` — full schema, banner removed
- `docs/DESIGN_SYSTEM.md` — token scales and primitive list filled in
- `docs/DOMAIN_RULES.md` — extend if the design surfaced new invariants; never contradict
- `docs/ROADMAP.md` — frozen architectural decisions, open questions, session log
- `CLAUDE.md` — update only if the real commands or structure differ from what it claims

## Acceptance criteria

- [ ] `docs/ARCHITECTURE.md` contains no remaining OPEN or SKELETON markers
- [ ] Every architectural decision has a stated rationale and rejected alternatives
- [ ] `docs/DATABASE.md` specifies every table, column, type, constraint, index, and policy
- [ ] The task ↔ work block relationship is explicitly decided and justified
- [ ] Timezone, recurrence, optimistic update, and DnD strategies are each documented
      concretely enough that a different agent could implement them
- [ ] Design tokens and primitive components are specified
- [ ] The scaffold installs and `pnpm dev` serves a page
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `docs/ROADMAP.md` records frozen decisions and any open questions
- [ ] No application features are implemented

## Non-goals

Do not implement: any of the five product systems, real database migrations, authentication
flows, calendar rendering, or styled feature UI. Placeholder pages are Phase 1's job.

## On finishing

Summarize: architecture decisions, assumptions made, risky areas, and the recommended
implementation order. Flag anything in the specs that your architecture cannot support as
written — that is exactly what this phase is for.
