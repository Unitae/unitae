-- Approved hour credit on a monthly report, granted by the secretary on top of reported
-- field hours (school attendance, approved assignments…). Counts toward pioneer pace and
-- goals only — exports keep pure field-service hours. Additive and nullable: no existing
-- row changes meaning, and the deployed image keeps working against the new column.
ALTER TABLE "PublisherActivity" ADD COLUMN "creditHours" INTEGER;
