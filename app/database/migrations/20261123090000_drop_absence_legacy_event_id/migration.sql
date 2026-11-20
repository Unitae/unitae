-- Absence.legacyEventId named the day-off event a row was copied from; the events are dropped and no deployed version
-- reads or writes it any more (it was @ignore in the version before). The column goes, with its unique index.
DROP INDEX IF EXISTS "Absence_legacyEventId_key";
ALTER TABLE "Absence" DROP COLUMN IF EXISTS "legacyEventId";
