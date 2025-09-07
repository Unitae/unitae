-- CreateTable: CongregationUserRole (explicit congregation-scoped role assignment)
CREATE TABLE "CongregationUserRole" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,
    CONSTRAINT "CongregationUserRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CongregationUserRole_userId_roleId_congregationId_key"
  ON "CongregationUserRole"("userId", "roleId", "congregationId");

ALTER TABLE "CongregationUserRole"
  ADD CONSTRAINT "CongregationUserRole_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CongregationUserRole"
  ADD CONSTRAINT "CongregationUserRole_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "UserRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CongregationUserRole"
  ADD CONSTRAINT "CongregationUserRole_congregationId_fkey"
  FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate data from implicit _UserToUserRole join table
INSERT INTO "CongregationUserRole" ("userId", "roleId", "congregationId")
SELECT jt."B" AS "userId", jt."A" AS "roleId", u."congregationId"
FROM "_UserToUserRole" jt
JOIN "User" u ON u."id" = jt."B";

-- Drop the implicit many-to-many join table
DROP TABLE "_UserToUserRole";
