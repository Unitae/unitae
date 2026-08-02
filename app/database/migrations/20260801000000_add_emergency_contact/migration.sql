-- AlterTable: emergency-preparedness flags on Member
ALTER TABLE "Member" ADD COLUMN "dpaCardUpToDate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "survivalBackpackReady" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: EmergencyContact (people to contact about a Member in a crisis)
CREATE TABLE "EmergencyContact" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyContact_id_congregationId_key" ON "EmergencyContact"("id", "congregationId");
CREATE INDEX "EmergencyContact_congregationId_idx" ON "EmergencyContact"("congregationId");
CREATE INDEX "EmergencyContact_memberId_congregationId_idx" ON "EmergencyContact"("memberId", "congregationId");

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_memberId_congregationId_fkey" FOREIGN KEY ("memberId", "congregationId") REFERENCES "Member"("id", "congregationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "EmergencyContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmergencyContact" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmergencyContact" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Seed the two new global permission rows (idempotent — safe to re-run)
INSERT INTO "Permission" ("key")
VALUES ('emergency-info-viewer'), ('emergency-info-manager')
ON CONFLICT ("key") DO NOTHING;
