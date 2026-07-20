-- Repairs day-off events that were miscategorized as freeform during the
-- EventKind → template migration series on 2026-07-20, and backfills the
-- hasConflict flag on any part/service-part assignment that overlaps a
-- day-off owned by the same member (the miscategorisation had also hidden
-- those overlaps from refreshConflictFlags).
--
-- Root cause: both 2026-07-20 migrations end with a "route orphans to
-- freeform" fallback (20260720100000_drop_event_kind step 3 when the
-- freeform template happens to exist, 20260720200000_seed_system_templates
-- step 3 after it seeds one). Congregations that had never been seeded via
-- `pnpm prisma db seed` had NEITHER system template, so
-- drop_event_kind step 2 (off → day-off) was a no-op, its own step 3
-- (any → freeform) was a no-op too, and the events kept templateId=NULL.
-- The kindId column was dropped between the two migrations, permanently
-- erasing the "this used to be an `off`" signal. seed_system_templates
-- then seeded both templates and its step 3 defaulted every remaining
-- orphan to freeform — that's the write that actually stamped the wrong
-- template in production (`we can't tell which orphaned rows were
-- originally day-offs vs. freeform-like, so route them all to freeform —
-- the safest default`).
--
-- Symptom: legacy day-offs surface on /programs and are absent from
-- /programs/days-off, because they now carry template.key = 'freeform'.
--
-- Recovery heuristic: a freeform event that (a) has no eventParts,
-- (b) has no eventServiceParts, and (c) spans at least 20 hours is a
-- day-off with overwhelming likelihood as of 2026-07-21. No in-app path
-- produces a freeform event with startDate/endDate on different calendar
-- days: handleFreeformMode (features/events/routes/programs/new.tsx)
-- passes a single `date` twice to combineLocalDateTime before calling
-- createFreeformEvent, so a well-formed interval is < 24 h. Day-offs
-- from /me/days-off run through createDayOff; the form's end-date `min`
-- attribute enforces endDate ≥ startDate + 1 day, though the enforcement
-- is browser-only (createDayOff only rejects startDate > endDate), so a
-- scripted POST could slip a same-day day-off past the server — the 20 h
-- floor would then miss that row in the repair, accepted as a limitation.
--
-- One-shot repair, not idempotent for future writes: a legitimate
-- multi-day freeform event created between two runs (e.g. an overnight
-- assembly entered as freeform) would match the heuristic and get
-- converted to a day-off. Postgres records this migration as applied
-- after the first successful run so `prisma migrate deploy` will not
-- re-execute it; do not manually re-run.
--
-- Assumes no in-flight imports: importEvents (features/settings/server/
-- import-events.server.ts) writes events before importEventParts adds
-- their parts, so a snapshot taken between the two would show a legit
-- templated event matching the heuristic. Migration deploys are not
-- concurrent with imports today.

-- 1. Re-link freeform events that match the day-off shape.
DO $$
DECLARE
  v_count int;
BEGIN
  UPDATE "Event" e
     SET "templateId" = dayoff."id"
    FROM "EventTemplate" freeform
    JOIN "EventTemplate" dayoff
      ON dayoff."key" = 'day-off'
     AND dayoff."congregationId" = freeform."congregationId"
   WHERE freeform."key" = 'freeform'
     AND e."templateId" = freeform."id"
     AND e."endDate" - e."startDate" >= interval '20 hours'
     AND NOT EXISTS (SELECT 1 FROM "EventPart" p WHERE p."eventId" = e."id")
     AND NOT EXISTS (SELECT 1 FROM "EventServicePart" sp WHERE sp."eventId" = e."id");
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE 'Day-off recovery: re-linked % freeform event(s) with the day-off template.', v_count;
  END IF;
END $$;

-- 2. Backfill hasConflict on parts/services whose event overlaps a day-off
--    owned by the same member.
--
--    While the day-offs above lived on the freeform template,
--    refreshConflictFlags and checkDayOffConflict (features/events/server/
--    event-part-assignments.server.ts) filtered them out via
--    `NOT: { template: { key: 'day-off' } }`, so every overlap for a
--    misclassified day-off was skipped and hasConflict stayed false when
--    it should have been true. Re-linking the template (step 1) does not
--    retrigger those refreshes, so the flags stay stale until the member's
--    next day-off create/delete.
--
--    Runs against every day-off (not only the ones re-linked in step 1) —
--    the invariant "any assignment overlapping a day-off must have
--    hasConflict = true" is unconditional, and constraining to the
--    just-repaired set would leave any pre-existing drift in place. Only
--    flips false → true; a legitimately-set true from a co-participant
--    conflict is never cleared.
DO $$
DECLARE
  v_parts int;
  v_services int;
BEGIN
  -- Comma-join in FROM (rather than explicit JOIN) so the target-table
  -- alias `ep` remains reachable from the join predicate — Postgres does
  -- not allow the UPDATE target to be referenced inside an explicit JOIN
  -- clause. Same story for the EventServicePart update below.
  UPDATE "EventPart" ep
     SET "hasConflict" = true, "updatedAt" = NOW()
    FROM "Event" dayoff,
         "EventTemplate" doTpl,
         "UserAccount" creator,
         "Event" host
   WHERE doTpl."id" = dayoff."templateId"
     AND doTpl."key" = 'day-off'
     AND creator."id" = dayoff."createdById"
     AND host."id" = ep."eventId"
     AND creator."memberId" IS NOT NULL
     AND (ep."assigneeId" = creator."memberId" OR ep."assistantId" = creator."memberId")
     AND host."startDate" <= dayoff."endDate"
     AND host."endDate" >= dayoff."startDate"
     AND host."id" <> dayoff."id"
     AND ep."hasConflict" = false;
  GET DIAGNOSTICS v_parts = ROW_COUNT;

  UPDATE "EventServicePart" esp
     SET "hasConflict" = true, "updatedAt" = NOW()
    FROM "Event" dayoff,
         "EventTemplate" doTpl,
         "UserAccount" creator,
         "Event" host
   WHERE doTpl."id" = dayoff."templateId"
     AND doTpl."key" = 'day-off'
     AND creator."id" = dayoff."createdById"
     AND host."id" = esp."eventId"
     AND creator."memberId" IS NOT NULL
     AND esp."assigneeId" = creator."memberId"
     AND host."startDate" <= dayoff."endDate"
     AND host."endDate" >= dayoff."startDate"
     AND host."id" <> dayoff."id"
     AND esp."hasConflict" = false;
  GET DIAGNOSTICS v_services = ROW_COUNT;

  IF v_parts > 0 OR v_services > 0 THEN
    RAISE NOTICE 'Conflict backfill: flipped hasConflict → true on % event part(s) and % service part(s) overlapping a member''s day-off.', v_parts, v_services;
  END IF;
END $$;
