# @momentum/core

Framework-free domain layer: entity types, enums, and (from Phase 1 onward) the
centralized date/time utilities and pure domain logic. No React, no Next, no Supabase
(lint-enforced).

Consumed via subpath exports only — `@momentum/core/types`, `@momentum/core/time`, … —
never via a package-wide barrel. The planned module map and the internal dependency
order are in `docs/ARCHITECTURE.md` §2.
