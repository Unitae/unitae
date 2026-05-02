-- CreateTable: ExternalSpeaker (per-congregation registry of external speakers)
CREATE TABLE "ExternalSpeaker" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "congregationName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ExternalSpeaker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSpeaker_id_congregationId_key" ON "ExternalSpeaker"("id", "congregationId");
CREATE INDEX "ExternalSpeaker_congregationId_archivedAt_idx" ON "ExternalSpeaker"("congregationId", "archivedAt");

-- AddForeignKey
ALTER TABLE "ExternalSpeaker" ADD CONSTRAINT "ExternalSpeaker_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "ExternalSpeaker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExternalSpeaker" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ExternalSpeaker" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Add FK column on ProgrammePartAssignment
ALTER TABLE "ProgrammePartAssignment" ADD COLUMN "externalSpeakerId" INTEGER;

-- AddForeignKey
ALTER TABLE "ProgrammePartAssignment" ADD CONSTRAINT "ProgrammePartAssignment_externalSpeakerId_fkey" FOREIGN KEY ("externalSpeakerId") REFERENCES "ExternalSpeaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ProgrammePartAssignment_externalSpeakerId_idx" ON "ProgrammePartAssignment"("externalSpeakerId");

-- Auto-migrate existing free-text names: one ExternalSpeaker per distinct (congregationId, trimmed name)
INSERT INTO "ExternalSpeaker" ("name", "congregationName", "congregationId", "updatedAt")
SELECT DISTINCT TRIM("externalSpeakerName"), '', "congregationId", CURRENT_TIMESTAMP
FROM "ProgrammePartAssignment"
WHERE "externalSpeakerName" IS NOT NULL AND TRIM("externalSpeakerName") <> '';

-- Backfill the FK on past assignments
UPDATE "ProgrammePartAssignment" pa
SET "externalSpeakerId" = es."id"
FROM "ExternalSpeaker" es
WHERE pa."externalSpeakerName" IS NOT NULL
  AND TRIM(pa."externalSpeakerName") = es."name"
  AND pa."congregationId" = es."congregationId";

-- Drop the now-unused free-text column
ALTER TABLE "ProgrammePartAssignment" DROP COLUMN "externalSpeakerName";
