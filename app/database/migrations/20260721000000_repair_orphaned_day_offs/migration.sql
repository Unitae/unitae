-- Repairs day-off events that were miscategorized as freeform during the
-- EventKind → template migration series on 2026-07-20.
--
-- Root cause:
--   20260720100000_drop_event_kind step 2 tried to route `off`-kind events
--   to the `day-off` template via an INNER JOIN that required the template
--   to already exist in each congregation. In congregations that had never
--   been seeded via `pnpm prisma db seed`, the day-off template row did
--   not exist yet, so the JOIN produced zero rows and the events kept
--   templateId=NULL. Step 4 then dropped the `kindId` column, permanently
--   erasing the "this used to be an `off`" evidence. The follow-up
--   migration 20260720200000_seed_system_templates step 3 defaulted every
--   remaining orphan to `freeform` (comment: "we can't tell which orphaned
--   rows were originally day-offs vs. freeform-like, so route them all to
--   freeform — the safest default").
--
-- Symptom: legacy day-offs surface on /programs and are absent from
-- /programs/days-off, because they now carry template.key = 'freeform'.
--
-- Recovery heuristic: a freeform event that (a) has no eventParts, (b) has
-- no eventServiceParts, and (c) spans at least 20 hours is a day-off with
-- overwhelming likelihood. Real freeform events are created by
-- createFreeformEvent (features/events/server/event-parts.server.ts),
-- which reads a single `date` plus `startTime`/`endTime` from the form and
-- combines them — start and end share the same calendar date, so the
-- interval is at most 24h and in practice a few hours. The 20h threshold
-- lets a same-day freeform event breathe while still catching every
-- multi-day range that days-off/new.tsx produces (endDate ≥ startDate + 1
-- day, enforced by the UI's `min` on the end-date field).
--
-- Idempotent — the second run finds no freeform events still matching the
-- heuristic because the first run already moved them onto the day-off
-- template.

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
    RAISE NOTICE 'Day-off recovery: re-linked % freeform event(s) with the day-off template — see 20260721000000_repair_orphaned_day_offs for the heuristic.', v_count;
  END IF;
END $$;
