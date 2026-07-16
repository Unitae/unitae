-- Add a draft/released workflow on Event so programme managers can build a
-- schedule in private and publish it in one explicit step. The board, the
-- notification pipeline, and the dashboard conflict queries all ignore drafts.

ALTER TABLE "Event" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft';

-- Every existing event is already live in production, so backfill them to the
-- released state. New events start as 'draft' via the column default.
UPDATE "Event" SET "status" = 'released';
