-- TerritoryKind: the entity behind what is still the `TerritoryKindKey` enum on
-- `Territory.type`. It exists now so per-kind configuration has a home that
-- survives kinds becoming user-created; `Territory` is deliberately NOT pointed
-- at it yet, so this migration is purely additive.
--
-- TerritoryKindAllowedRole: which roles a publisher must hold to be attributed a
-- territory of that kind. No rows for a kind = no restriction.

-- CreateTable
CREATE TABLE "TerritoryKind" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT true,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerritoryKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerritoryKindAllowedRole" (
    "kindId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "TerritoryKindAllowedRole_pkey" PRIMARY KEY ("kindId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryKind_key_congregationId_key" ON "TerritoryKind"("key", "congregationId");
CREATE UNIQUE INDEX "TerritoryKind_id_congregationId_key" ON "TerritoryKind"("id", "congregationId");
CREATE INDEX "TerritoryKind_congregationId_idx" ON "TerritoryKind"("congregationId");
CREATE INDEX "TerritoryKindAllowedRole_roleId_idx" ON "TerritoryKindAllowedRole"("roleId");
CREATE INDEX "TerritoryKindAllowedRole_congregationId_idx" ON "TerritoryKindAllowedRole"("congregationId");

-- AddForeignKey
ALTER TABLE "TerritoryKind" ADD CONSTRAINT "TerritoryKind_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Compound FK so a kind can never be linked across tenants.
ALTER TABLE "TerritoryKindAllowedRole" ADD CONSTRAINT "TerritoryKindAllowedRole_kindId_congregationId_fkey" FOREIGN KEY ("kindId", "congregationId") REFERENCES "TerritoryKind"("id", "congregationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryKindAllowedRole" ADD CONSTRAINT "TerritoryKindAllowedRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryKindAllowedRole" ADD CONSTRAINT "TerritoryKindAllowedRole_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security
-- CASE/WHEN rather than OR — the planner may reorder OR branches and leak rows.
-- See docs/development/row-level-security.md.
ALTER TABLE "TerritoryKind" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TerritoryKind" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TerritoryKind" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "TerritoryKindAllowedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TerritoryKindAllowedRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TerritoryKindAllowedRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Seed the five built-in kinds for every existing congregation. New
-- congregations get them from seedBuiltInTerritoryKinds at setup.
--
-- Keys are the TerritoryKindKey *member names*, not the @map strings: the Prisma
-- client surfaces `Territory.type` as 'Classical', while the column stores
-- 'doors-to-doors'. Storing the member name is what lets a caller look a kind up
-- by `territory.type` without a translation table.
INSERT INTO "TerritoryKind" ("key", "isBuiltIn", "congregationId", "updatedAt")
SELECT k, true, c."id", CURRENT_TIMESTAMP
FROM "Congregation" c
CROSS JOIN (VALUES ('Classical'), ('Univ'), ('Commerces'), ('Phone'), ('Hotel')) AS t(k)
ON CONFLICT ("key", "congregationId") DO NOTHING;
