-- Pastoral follow-up dates for the group overseer: when the person arrived in the congregation
-- (a welcome visit is flagged for three months) and the latest pastoral visit (one date, no
-- history, no notes). NULL for everyone already there: no backfill, and the deployed image, which
-- never reads the columns, keeps working against them.
ALTER TABLE "Member" ADD COLUMN "arrivedAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "lastPastoralVisitAt" TIMESTAMP(3);
