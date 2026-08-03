-- CreateTable: PioneerEnrolment (the *plan* half of the plan/actual pioneer split)
CREATE TABLE "PioneerEnrolment" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" "PublisherType" NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endMonth" INTEGER,
    "endYear" INTEGER,
    "monthlyGoal" INTEGER,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PioneerEnrolment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PioneerEnrolment_id_congregationId_key" ON "PioneerEnrolment"("id", "congregationId");
CREATE INDEX "PioneerEnrolment_congregationId_idx" ON "PioneerEnrolment"("congregationId");
CREATE INDEX "PioneerEnrolment_memberId_congregationId_idx" ON "PioneerEnrolment"("memberId", "congregationId");

-- AddForeignKey
ALTER TABLE "PioneerEnrolment" ADD CONSTRAINT "PioneerEnrolment_memberId_congregationId_fkey" FOREIGN KEY ("memberId", "congregationId") REFERENCES "Member"("id", "congregationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PioneerEnrolment" ADD CONSTRAINT "PioneerEnrolment_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Illegal-state prevention: end bounds are null together (ongoing) or set together (closed).
-- Defence in depth alongside the aggregate's _assertEndBoundsPaired invariant.
ALTER TABLE "PioneerEnrolment" ADD CONSTRAINT "end_bounds_paired"
  CHECK (("endMonth" IS NULL) = ("endYear" IS NULL));

-- Row-Level Security
ALTER TABLE "PioneerEnrolment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PioneerEnrolment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PioneerEnrolment" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
