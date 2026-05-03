-- AlterTable: per-congregation limit for card overlays (null = unlimited, written by control plane)
ALTER TABLE "Congregation" ADD COLUMN "maxCardOverlays" INTEGER;

-- CreateTable: TerritoryCardOverlay (per-congregation decorative polygons printed on the territory card)
CREATE TABLE "TerritoryCardOverlay" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT NOT NULL,
    "paths" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "TerritoryCardOverlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TerritoryCardOverlay_congregationId_idx" ON "TerritoryCardOverlay"("congregationId");

-- AddForeignKey
ALTER TABLE "TerritoryCardOverlay" ADD CONSTRAINT "TerritoryCardOverlay_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "TerritoryCardOverlay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TerritoryCardOverlay" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TerritoryCardOverlay" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
