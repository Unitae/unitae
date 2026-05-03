-- CreateTable: TerritoryPerimeter — singleton-per-congregation polygon used to gate
-- Building.inTerritory and to draw a fallback outline on the printed PDF when no
-- TerritoryCardOverlay zones are defined.
CREATE TABLE "TerritoryPerimeter" (
    "id" SERIAL NOT NULL,
    "paths" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "TerritoryPerimeter_pkey" PRIMARY KEY ("id")
);

-- Singleton-per-congregation
CREATE UNIQUE INDEX "TerritoryPerimeter_congregationId_key" ON "TerritoryPerimeter"("congregationId");

-- AddForeignKey
ALTER TABLE "TerritoryPerimeter" ADD CONSTRAINT "TerritoryPerimeter_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "TerritoryPerimeter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TerritoryPerimeter" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TerritoryPerimeter" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Backfill from the legacy Setting('territory') rows.
-- Source shape: JSON array of [lat, lng] pairs, e.g. [[45.75, 4.83], [45.76, 4.84], ...]
-- Destination shape: JSON array of {lat, lng} objects.
-- Only INSERT when the source has at least 3 valid 2-element pairs. ON CONFLICT makes the
-- migration safely re-runnable. The legacy Setting rows are left in place on purpose —
-- a follow-up PR will delete them after a soak period.
INSERT INTO "TerritoryPerimeter" ("paths", "updatedAt", "congregationId")
SELECT
  (
    SELECT jsonb_agg(jsonb_build_object('lat', (pt->>0)::float, 'lng', (pt->>1)::float))
    FROM jsonb_array_elements(s.value::jsonb) AS pt
    WHERE jsonb_typeof(pt) = 'array' AND jsonb_array_length(pt) = 2
  ) AS paths,
  CURRENT_TIMESTAMP,
  s."congregationId"
FROM "Setting" s
WHERE s.key = 'territory'
  AND s.value IS NOT NULL
  AND s.value <> ''
  AND s.value <> '[]'
  AND jsonb_typeof(s.value::jsonb) = 'array'
  AND jsonb_array_length(s.value::jsonb) >= 3
ON CONFLICT ("congregationId") DO NOTHING;
