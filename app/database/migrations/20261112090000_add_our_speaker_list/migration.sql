-- « Notre liste »: the brothers of ours who give public talks in other congregations, and when our list last went to
-- each congregation whose list we receive. New tables and columns only: nothing existing changes.


-- AlterTable
ALTER TABLE "SpeakerCongregation" ADD COLUMN     "ourListSentAt" TIMESTAMP(3),
ADD COLUMN     "ourListSentManually" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ourListSentDigest" TEXT;

-- CreateTable
CREATE TABLE "OurSpeaker" (
    "id" SERIAL NOT NULL,
    "onList" BOOLEAN NOT NULL DEFAULT false,
    "talks" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "phoneMode" TEXT NOT NULL DEFAULT 'record',
    "phoneCustom" TEXT NOT NULL DEFAULT '',
    "phone2" TEXT NOT NULL DEFAULT '',
    "emailMode" TEXT NOT NULL DEFAULT 'record',
    "emailCustom" TEXT NOT NULL DEFAULT '',
    "email2" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "memberId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "OurSpeaker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OurSpeaker_memberId_key" ON "OurSpeaker"("memberId");

-- CreateIndex
CREATE INDEX "OurSpeaker_congregationId_onList_idx" ON "OurSpeaker"("congregationId", "onList");

-- CreateIndex
CREATE UNIQUE INDEX "OurSpeaker_id_congregationId_key" ON "OurSpeaker"("id", "congregationId");

-- AddForeignKey
ALTER TABLE "OurSpeaker" ADD CONSTRAINT "OurSpeaker_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OurSpeaker" ADD CONSTRAINT "OurSpeaker_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "OurSpeaker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OurSpeaker" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OurSpeaker" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
