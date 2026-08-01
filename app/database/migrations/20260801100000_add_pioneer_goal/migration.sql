-- CreateTable
CREATE TABLE "PioneerGoal" (
    "id" SERIAL NOT NULL,
    "serviceYear" INTEGER NOT NULL,
    "type" "PublisherType" NOT NULL,
    "monthlyHours" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PioneerGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PioneerGoal_congregationId_serviceYear_idx" ON "PioneerGoal"("congregationId", "serviceYear");

-- CreateIndex
CREATE UNIQUE INDEX "PioneerGoal_serviceYear_type_congregationId_key" ON "PioneerGoal"("serviceYear", "type", "congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "PioneerGoal_id_congregationId_key" ON "PioneerGoal"("id", "congregationId");

-- AddForeignKey
ALTER TABLE "PioneerGoal" ADD CONSTRAINT "PioneerGoal_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "PioneerGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PioneerGoal" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PioneerGoal" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
