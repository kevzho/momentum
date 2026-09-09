# packages

Shared code, consumed as TypeScript source (no build step). Boundaries were decided in
Phase 0 and are recorded in `docs/ARCHITECTURE.md` §2; they are drawn where the
dependency set or the runtime environment differs, not per feature.

```
core/    @momentum/core   framework-free domain: types, time, recurrence, calendar geometry,
                          tasks, habits, scheduling (Find Time), focus, gamification,
                          analytics, parser — each a subpath export (@momentum/core/time)
db/      @momentum/db     generated Database types, row↔domain mappers, repositories over
                          a typed Supabase client
ui/      @momentum/ui     design-system primitives on shadcn/ui (docs/DESIGN_SYSTEM.md)
```

Rules (lint-enforced from `eslint.config.mjs`):

- `core` and `db` never import React or Next; `core` never imports Supabase.
- `ui` never imports Next or any data access.
- Nothing imports `core` through a package-wide barrel; use the subpath for the module.

Anything the desktop app's auxiliary windows will also need lives here, not in `apps/web`.
