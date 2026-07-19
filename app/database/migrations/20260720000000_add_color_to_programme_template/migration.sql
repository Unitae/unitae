-- Adds a color field to ProgrammeTemplate. This is step 1 of the "kill EventKind" refactor:
-- the color field previously lived on EventKind. A follow-up migration will drop EventKind
-- once all readers/writers use the template's color directly.
--
-- Existing templates get the same neutral gray default that EventKind.Off historically used;
-- callers writing new templates can override.

ALTER TABLE "ProgrammeTemplate" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#cfcfcf';

-- Backfill colour for templates already linked to an EventKind (the seed doesn't set kindId
-- today, so this is a no-op for freshly-seeded tenants — but it preserves colour for any
-- tenant that manually linked a kind).
UPDATE "ProgrammeTemplate" t
SET "color" = k."color"
FROM "EventKind" k
WHERE t."kindId" = k."id";
