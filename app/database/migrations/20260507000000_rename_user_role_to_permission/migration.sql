-- Pure terminology rename: UserRole -> Permission, CongregationUserRole -> CongregationUserPermission.
-- The "key" column values (e.g. 'admin', 'territories-manager') are preserved verbatim, so existing
-- user/permission assignments continue to grant the same access. RLS policies and FK relationships
-- transfer automatically with ALTER TABLE ... RENAME; only the constraint and index names need
-- explicit renames to match Prisma's generated naming convention going forward.

-- Rename tables.
ALTER TABLE "UserRole" RENAME TO "Permission";
ALTER TABLE "CongregationUserRole" RENAME TO "CongregationUserPermission";

-- Rename the FK column (role -> permission).
ALTER TABLE "CongregationUserPermission" RENAME COLUMN "roleId" TO "permissionId";

-- Rename primary key constraints.
ALTER TABLE "Permission" RENAME CONSTRAINT "UserRole_pkey" TO "Permission_pkey";
ALTER TABLE "CongregationUserPermission"
  RENAME CONSTRAINT "CongregationUserRole_pkey" TO "CongregationUserPermission_pkey";

-- Rename foreign-key constraints.
ALTER TABLE "CongregationUserPermission"
  RENAME CONSTRAINT "CongregationUserRole_userId_fkey" TO "CongregationUserPermission_userId_fkey";
ALTER TABLE "CongregationUserPermission"
  RENAME CONSTRAINT "CongregationUserRole_roleId_fkey" TO "CongregationUserPermission_permissionId_fkey";
ALTER TABLE "CongregationUserPermission"
  RENAME CONSTRAINT "CongregationUserRole_congregationId_fkey" TO "CongregationUserPermission_congregationId_fkey";

-- Rename unique indexes. The compound index name is truncated to PostgreSQL's 63-char identifier
-- limit (matches Prisma's own truncation: ..._congregation_key, not ..._congregationId_key).
ALTER INDEX "UserRole_key_key" RENAME TO "Permission_key_key";
ALTER INDEX "CongregationUserRole_userId_roleId_congregationId_key"
  RENAME TO "CongregationUserPermission_userId_permissionId_congregation_key";
ALTER INDEX "CongregationUserRole_id_congregationId_key"
  RENAME TO "CongregationUserPermission_id_congregationId_key";
