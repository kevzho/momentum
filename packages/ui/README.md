# @momentum/ui

Design-system primitives. shadcn/ui (style `radix-nova`, Radix primitives) is the base
layer; Momentum-specific primitives listed in `docs/DESIGN_SYSTEM.md` sit on top.

- Presentational and framework-agnostic: no `next/*`, no data access (lint-enforced).
- Consumed as TypeScript source; no build step.
- Add shadcn components from `apps/web` or from here:
  `pnpm dlx shadcn@latest add <component> -c packages/ui`
- Tokens live in `src/styles/globals.css`. Components use semantic tokens only.
