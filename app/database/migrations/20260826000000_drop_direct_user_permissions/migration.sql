-- Completes the "replace" half of the role-based permission epic (#142, phase 7 / #149).
--
-- Until now a permission could reach a UserAccount three ways: a direct
-- CongregationUserPermission row, a role on the account, or a role on its linked
-- Member. This migration removes the first path by turning every direct grant
-- into a role assignment, then dropping the table. After it, resolveEffectivePermissions
-- walks roles only, and the settings screens are the single place a permission is granted.
--
-- The contract is *no change in who can do what*. Each (congregation, permission)
-- pair that has at least one direct grant gets one auto-role granting exactly that
-- permission, and each grant becomes a UserRoleAssignment to it.
--
-- Auto-roles are ordinary custom roles (isBuiltIn = false), so admins can rename,
-- re-scope or delete them afterwards. Their name and description stay NULL: that is
-- the convention built-in Role rows already use, and it means no French or English
-- text is pinned into the database here — getRoleDisplayName resolves the label from
-- the message catalogue for the reader's locale, and an admin who renames one stores
-- their own name, which then wins.
--
-- Every INSERT is ON CONFLICT DO NOTHING so the file is safe to re-run, and safe for
-- a user who already holds the same permission through a role.
--
-- RLS note: Role, RolePermission, UserRoleAssignment and AuditLog all FORCE row level
-- security, but every policy short-circuits to `true` when app.congregation_id is unset
-- (the CASE WHEN NULLIF(...) IS NULL THEN true form). A migration runs with it unset,
-- so these cross-tenant writes are permitted.

-- The permission -> auto-role key mapping is materialized into a temp table rather than
-- recomputed per statement. The collision CASE below reads "Role", so re-evaluating it
-- after the roles are inserted would return a different key and the later joins would
-- miss. Resolve once, reuse three times.
CREATE TEMP TABLE "_direct_grant_role" (
    "congregationId" INTEGER NOT NULL,
    "permissionId"   INTEGER NOT NULL,
    "roleKey"        TEXT    NOT NULL,
    PRIMARY KEY ("congregationId", "permissionId")
);

-- A congregation may already own a custom role slugified to one of these keys — an
-- admin is free to create a role called "Peut tout faire". Reusing it would silently
-- grant that permission to everyone already assigned to it, so a taken key falls back
-- to "<key>-migrated", and then to "<key>-migrated-<permissionId>".
INSERT INTO "_direct_grant_role" ("congregationId", "permissionId", "roleKey")
SELECT n.cid,
       n.pid,
       CASE
           WHEN NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."congregationId" = n.cid AND r."key" = n.base)
               THEN n.base
           WHEN NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."congregationId" = n.cid AND r."key" = n.base || '-migrated')
               THEN n.base || '-migrated'
           ELSE n.base || '-migrated-' || n.pid::text
       END
FROM (
    SELECT DISTINCT cup."congregationId" AS cid, cup."permissionId" AS pid, m.role_key AS base
    FROM "CongregationUserPermission" cup
    JOIN "Permission" p ON p."id" = cup."permissionId"
    JOIN (VALUES
        ('admin',                    'can-do-anything'),
        ('board-viewer',             'can-view-board-documents'),
        ('board-uploader',           'can-upload-board-documents'),
        ('board-validator',          'can-validate-board-documents'),
        ('territories-viewer',       'can-view-territories'),
        ('territories-manager',      'can-edit-territories'),
        ('prospection-viewer',       'can-view-prospection'),
        ('prospection-manager',      'can-edit-prospection'),
        ('publisher-viewer',         'can-view-publishers'),
        ('publisher-manager',        'can-edit-publishers'),
        ('emergency-info-viewer',    'can-view-emergency-info'),
        ('emergency-info-manager',   'can-edit-emergency-info'),
        ('activity-viewer',          'can-view-activities'),
        ('activity-manager',         'can-edit-activities'),
        ('pioneer-goal-manager',     'can-manage-pioneer-goals'),
        ('program-viewer',           'can-view-programs'),
        ('program-manager',          'can-edit-programs'),
        ('absence-viewer',           'can-view-absences'),
        ('external-speaker-viewer',  'can-view-external-speakers'),
        ('external-speaker-manager', 'can-edit-external-speakers'),
        ('settings-user-manager',    'can-manage-users'),
        ('roles-viewer',             'can-view-roles'),
        ('roles-manager',            'can-manage-roles'),
        ('permissions-manager',      'can-manage-permissions')
    ) AS m(permission_key, role_key) ON m.permission_key = p."key"
) n;

-- 1. One auto-role per (congregation, permission) that anybody holds directly.
INSERT INTO "Role" ("key", "name", "description", "isBuiltIn", "congregationId", "createdAt", "updatedAt")
SELECT m."roleKey", NULL, NULL, false, m."congregationId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_direct_grant_role" m
ON CONFLICT ("key", "congregationId") DO NOTHING;

-- 2. Each auto-role grants exactly the one permission it was created for.
INSERT INTO "RolePermission" ("roleId", "permissionId", "congregationId")
SELECT r."id", m."permissionId", m."congregationId"
FROM "_direct_grant_role" m
JOIN "Role" r ON r."congregationId" = m."congregationId" AND r."key" = m."roleKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 3. Every direct grant becomes a membership in the matching auto-role. A user who
--    already reached the permission through some other role just gains a second,
--    redundant path — the union is unchanged, which is the point.
INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
SELECT cup."userId", r."id", cup."congregationId"
FROM "CongregationUserPermission" cup
JOIN "_direct_grant_role" m
    ON m."congregationId" = cup."congregationId" AND m."permissionId" = cup."permissionId"
JOIN "Role" r ON r."congregationId" = m."congregationId" AND r."key" = m."roleKey"
ON CONFLICT ("userId", "roleId") DO NOTHING;

-- 4. One bulk audit event per affected congregation, so an admin who later wonders
--    where these roles came from can find the answer in the audit log. actorId is NULL:
--    nobody performed this, the deploy did.
INSERT INTO "AuditLog" ("action", "entityType", "entityId", "actorId", "actorEmail", "metadata", "congregationId", "createdAt")
SELECT 'permission.direct_grants_migrated',
       'Congregation',
       cup."congregationId",
       NULL,
       NULL,
       json_build_object(
           'grants', COUNT(*),
           'roles', COUNT(DISTINCT cup."permissionId"),
           'users', COUNT(DISTINCT cup."userId")
       )::text,
       cup."congregationId",
       CURRENT_TIMESTAMP
FROM "CongregationUserPermission" cup
GROUP BY cup."congregationId";

DROP TABLE "_direct_grant_role";

-- The direct edge is gone. Its RLS policy, indexes and foreign keys go with the table.
DROP TABLE "CongregationUserPermission";
