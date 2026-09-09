-- Momentum — an override belongs to an event, and to nothing else.
--
-- Domain Rule 16 says only events recur and that editing one occurrence writes
-- an override row linked to the series; Domain Rule 13 says the database is
-- what enforces the per-kind shape. Phase 2 pinned `kind = 'event'` on the
-- *series* side (`blocks_recurrence_kind_chk`) and left the *override* side
-- unpinned: `blocks_override_shape_chk` asked only that `series_id` and
-- `occurrence_date` arrive together. Nothing else closes the gap — the policy
-- checks ownership, `assert_same_owner()` checks that the referenced row
-- belongs to the same account, and neither looks at `kind`.
--
-- So this was accepted, as the signed-in owner over PostgREST, with nothing but
-- the publishable key and a session:
--
--   POST /rest/v1/calendar_blocks
--   {"kind":"work","task_id":"<mine>","series_id":"<my own event>",
--    "occurrence_date":"2026-09-08","start_at":…,"end_at":…}   -> 201, persisted
--
-- The row is unrepresentable in the domain, and the read path says so at the
-- top of its voice: `blocks.listWindow` classifies anything carrying a
-- `series_id` as an override, and `rowToEventBlock` throws for a kind that is
-- not `event`, so a single such row takes down every calendar week that
-- intersects it. Only the row's own account can write it and only that account
-- loses its week — which is why this waited for a migration of its own rather
-- than riding along with the guard triggers — but a schema that lets a client
-- brick a surface is still the schema's bug, not the mapper's.
--
-- One constraint, not two. `blocks_cancelled_chk` already requires
-- `series_id is not null`, so it now transitively requires an event as well,
-- which closes the quieter half of the same hole: a `work` row stored with
-- `cancelled = true` read back as *not* cancelled, because the mappers
-- hardcode `cancelled: false` for the kinds that cannot have it.
--
-- No data repair and no backfill: the application never wrote such a row
-- (`requireSeries` refuses a series whose kind is not `event`, and
-- `writeOverride` hardcodes `kind = 'event'`), and `add constraint` validates
-- the existing table on the way in, so a stack that somehow holds one fails
-- here loudly instead of carrying it forward.

alter table public.calendar_blocks
  drop constraint blocks_override_shape_chk,
  add constraint blocks_override_shape_chk check (
    (series_id is null) = (occurrence_date is null)
    and (series_id is null or kind = 'event')
  );
