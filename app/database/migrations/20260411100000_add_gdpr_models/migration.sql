-- AlterTable: add anonymizedAt to User for GDPR right to erasure
ALTER TABLE "User" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

-- CreateTable: DataDeletionRecord for tracking anonymization/deletion operations (backup reconciliation)
CREATE TABLE "DataDeletionRecord" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "DataDeletionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ConsentRecord for GDPR consent tracking
CREATE TABLE "ConsentRecord" (
    "id" SERIAL NOT NULL,
    "purpose" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "consentVersion" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataDeletionRecord_id_congregationId_key" ON "DataDeletionRecord"("id", "congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_id_congregationId_key" ON "ConsentRecord"("id", "congregationId");

-- AddForeignKey
ALTER TABLE "DataDeletionRecord" ADD CONSTRAINT "DataDeletionRecord_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security for new GDPR tables
ALTER TABLE "DataDeletionRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataDeletionRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DataDeletionRecord" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConsentRecord" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );
