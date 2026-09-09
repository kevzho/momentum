# Momentum

A scheduling-first, gamified productivity system.

> Everything competes for the same finite resource: your week.

Tasks, habits, events, and focus sessions all become time blocks on a weekly board.
Completing those blocks earns XP and progresses your account. Over time, Momentum learns
the difference between the week you planned and the week you actually lived.

## The flywheel

```
   CAPTURE → TASK → ESTIMATE → SCHEDULE → [ WEEK ] → START FOCUS
                                                         ↓
                                                     COMPLETE
                                                         ↓
                                                    ACTUAL TIME
                                                     ↙       ↘
                                              analytics       XP
                                                   ↓           ↓
                                            better plans   level up
                                                   ↘       ↙
                                                  NEXT WEEK
```

## Status

Phase 0 complete (2026-09-06): architecture decided, schema designed, workspace scaffold
running. Nothing user-facing is built yet; Phase 1 starts the application shell.
See [`docs/ROADMAP.md`](docs/ROADMAP.md) for phase status.

## Getting started

```
pnpm install
cp .env.example apps/web/.env.local   # fill in once Phase 2 adds Supabase
pnpm dev                              # http://localhost:3000
pnpm typecheck · pnpm lint · pnpm test · pnpm test:e2e (needs the local stack and a seeded database) · pnpm build
```

Node 24 and pnpm 10 (`packageManager` is pinned; `corepack` picks it up).

## Repo layout

```
CLAUDE.md          engineering constitution
AGENTS.md          agent operating instructions
docs/              durable product + architecture knowledge
specs/             per-phase implementation specs (00–15)
apps/web/          Next.js application — the canonical product
apps/desktop/      Tauri macOS shell (post-MVP; loads the deployed web app)
packages/core/     framework-free domain logic and types
packages/db/       generated database types, mappers, repositories
packages/ui/       design-system primitives
supabase/          migrations and seed data (trusted logic is SQL)
```

## Building this

Implementation runs phase by phase.

- [`docs/PROMPTS.md`](docs/PROMPTS.md) — every prompt, in order: model, effort, session
  message, and `/goal` for each phase. This is the one you copy from.
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — the strategy behind that ordering.

## Stack

Next.js · React · TypeScript · Tailwind · shadcn/ui · Supabase (Postgres + Auth + RLS) ·
dnd-kit · date-fns · Recharts · Vercel
