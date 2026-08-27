-- Reverses the role-per-permission shape that 20260826000000_drop_direct_user_permissions
-- left behind, and gives the congregation a real `admin` system role.
--
-- That migration turned every direct permission grant into its own single-permission
-- role (`can-view-territories`, `can-edit-programs`, …). One role per permission is not
-- a role model — it re-encodes the permission table as roles and leaves an admin staring
-- at two dozen synthetic entries that mean nothing to them.
--
-- The contract here is deliberately NOT "no change in who can do what". Every auto-role
-- other than `can-do-anything` is deleted together with the access it carried, so a user
-- who reached a permission only through one loses it until an admin grants a real role.
-- That is an accepted, explicit revocation: no live congregation has run the previous
-- migration, so the grants being dropped are test data. Do not re-use this file's shape
-- for a migration that runs against real tenants.
--
-- `can-do-anything` is the exception. It becomes the `admin` role — the one system role
-- worth keeping — carried over with its assignments intact.
--
-- Cascade note: every FK pointing at "Role" is ON DELETE CASCADE, so deleting an
-- auto-role also removes its RolePermission rows, its User/MemberRoleAssignments, and
-- every eligibility rule naming it. There are six of those tables — TemplatePart,
-- EventPart, TemplateServicePart and EventServicePart allowed-roles, plus
-- BoardSectionVisibilityRole and TerritoryKindAllowedRole — and step 4 counts all six
-- into the audit row. Counting a subset would be worse than counting none: the row
-- exists to make this loss visible, and an undercount reads as an authoritative total.
--
-- RLS note: Role, RolePermission, UserRoleAssignment and AuditLog FORCE row level
-- security, but every policy short-circuits to `true` when app.congregation_id is unset
-- (the CASE WHEN NULLIF(...) IS NULL THEN true form). A migration runs with it unset,
-- so these cross-tenant writes are permitted.

-- An auto-role is recognised by shape, not by key alone: exactly one permission, and
-- that permission is the one its key was minted from. A congregation may legitimately
-- own a custom role that happens to slugify to `can-...`, and deleting it because the
-- name collided would be the same silent revocation the previous migration guarded
-- against. Resolve the set once, reuse it four times.
CREATE TEMP TABLE "_auto_role" (
    "roleId"         INTEGER NOT NULL PRIMARY KEY,
    "congregationId" INTEGER NOT NULL,
    "isAdminRole"    BOOLEAN NOT NULL
);

INSERT INTO "_auto_role" ("roleId", "congregationId", "isAdminRole")
SELECT r."id",
       r."congregationId",
       p."key" = 'admin'
FROM "Role" r
JOIN "RolePermission" rp ON rp."roleId" = r."id"
JOIN "Permission" p ON p."id" = rp."permissionId"
-- The same permission -> key mapping 20260826000000 minted from, so the key must match
-- *the permission this role actually grants*. A flat list of the 24 known keys would be
-- looser than that: a one-permission role an admin keyed `can-view-absences` but pointed
-- at a different permission is theirs, not ours, and matching it would silently revoke
-- everyone assigned to it. Unmapped permissions fall back to `can-<key>`, exactly as the
-- previous migration's COALESCE did.
LEFT JOIN (VALUES
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
WHERE r."isBuiltIn" = false
  AND r."key" IN (
      COALESCE(m.role_key, 'can-' || p."key"),
      COALESCE(m.role_key, 'can-' || p."key") || '-migrated',
      COALESCE(m.role_key, 'can-' || p."key") || '-migrated-' || rp."permissionId"::text
  )
  -- Exactly one permission: a role an admin has since extended is theirs, not ours.
  AND (SELECT COUNT(*) FROM "RolePermission" x WHERE x."roleId" = r."id") = 1;

-- 1. Every congregation gets the `admin` system role. Name and description stay NULL —
--    the same convention the identity roles use, so no language is pinned into the
--    database and getRoleDisplayName resolves the label per reader locale.
--
--    ON CONFLICT DO NOTHING means a congregation that already owns a role keyed `admin`
--    keeps it untouched. Adopting it would grant Permission.Admin to everyone already
--    assigned to that role — a silent privilege escalation, which is strictly worse than
--    the migration doing nothing there. Step 4 refuses to delete `can-do-anything` in
--    that case, so nobody loses admin either way; the congregation simply keeps the
--    old-shaped role until someone resolves the clash by hand.
INSERT INTO "Role" ("key", "name", "description", "isBuiltIn", "congregationId", "createdAt", "updatedAt")
SELECT 'admin', NULL, NULL, true, c."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Congregation" c
ON CONFLICT ("key", "congregationId") DO NOTHING;

-- 2. The admin role grants Permission.Admin. Restricted to isBuiltIn rows so a
--    pre-existing custom role keyed `admin` is never widened by this migration.
INSERT INTO "RolePermission" ("roleId", "permissionId", "congregationId")
SELECT r."id", p."id", r."congregationId"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."key" = 'admin' AND r."isBuiltIn" = true AND p."key" = 'admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 3. Everyone holding the old `can-do-anything` auto-role joins the new `admin` role.
--    Runs before the delete so admin access is never absent, not even mid-transaction.
INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
SELECT ura."userId", target."id", ura."congregationId"
FROM "UserRoleAssignment" ura
JOIN "_auto_role" a ON a."roleId" = ura."roleId" AND a."isAdminRole"
JOIN "Role" target
    ON target."congregationId" = ura."congregationId"
   AND target."key" = 'admin'
   AND target."isBuiltIn" = true
ON CONFLICT ("userId", "roleId") DO NOTHING;

-- Same for the member side, which the previous migration never wrote to but an admin
-- may have since assigned by hand.
INSERT INTO "MemberRoleAssignment" ("memberId", "roleId", "congregationId")
SELECT mra."memberId", target."id", mra."congregationId"
FROM "MemberRoleAssignment" mra
JOIN "_auto_role" a ON a."roleId" = mra."roleId" AND a."isAdminRole"
JOIN "Role" target
    ON target."congregationId" = mra."congregationId"
   AND target."key" = 'admin'
   AND target."isBuiltIn" = true
ON CONFLICT ("memberId", "roleId") DO NOTHING;

-- 4. One audit row per congregation losing something, written *before* the delete while
--    the counts are still observable. No unique key to conflict on, so the re-run guard
--    is explicit — otherwise a replay files a second event and the trail reads as two
--    migrations. actorId is NULL: nobody performed this, the deploy did.
INSERT INTO "AuditLog" ("action", "entityType", "entityId", "actorId", "actorEmail", "metadata", "congregationId", "createdAt")
SELECT 'permission.auto_roles_removed',
       'Congregation',
       a."congregationId",
       NULL,
       NULL,
       json_build_object(
           'rolesDeleted', COUNT(*) FILTER (WHERE NOT a."isAdminRole"),
           'userAssignmentsRevoked', (
               SELECT COUNT(*) FROM "UserRoleAssignment" u
               JOIN "_auto_role" b ON b."roleId" = u."roleId"
               WHERE b."congregationId" = a."congregationId" AND NOT b."isAdminRole"
           ),
           'eligibilityRulesRemoved', (
               SELECT COUNT(*) FROM "TemplatePartAllowedRole" t
               JOIN "_auto_role" b ON b."roleId" = t."roleId"
               WHERE b."congregationId" = a."congregationId" AND NOT b."isAdminRole"
           ) + (
               SELECT COUNT(*) FROM "EventPartAllowedRole" e
               JOIN "_auto_role" b ON b."roleId" = e."roleId"
               WHERE b."congregationId" = a."congregationId" AND NOT b."isAdminRole"
           ) + (
               SELECT COUNT(*) FROM "BoardSectionVisibilityRole" s
               JOIN "_auto_role" b ON b."roleId" = s."roleId"
               WHERE b."congregationId" = a."congregationId" AND NOT b."isAdminRole"
           ) + (
               SELECT COUNT(*) FROM "TerritoryKindAllowedRole" k
               JOIN "_auto_role" b ON b."roleId" = k."roleId"
               WHERE b."congregationId" = a."congregationId" AND NOT b."isAdminRole"
           ) + (
               SELECT COUNT(*) FROM "TemplateServicePartAllowedRole" ts
               JOIN "_auto_role" b ON b."roleId" = ts."roleId"
               WHERE b."congregationId" = a."congregationId" AND NOT b."isAdminRole"
           ) + (
               SELECT COUNT(*) FROM "EventServicePartAllowedRole" es
               JOIN "_auto_role" b ON b."roleId" = es."roleId"
               WHERE b."congregationId" = a."congregationId" AND NOT b."isAdminRole"
           )
       )::text,
       a."congregationId",
       CURRENT_TIMESTAMP
FROM "_auto_role" a
WHERE NOT a."isAdminRole"
  AND NOT EXISTS (
      SELECT 1 FROM "AuditLog" l
      WHERE l."congregationId" = a."congregationId"
        AND l."action" = 'permission.auto_roles_removed'
  )
GROUP BY a."congregationId";

-- 5. Drop the auto-roles. Cascades take their permissions, assignments and eligibility
--    rules with them. `can-do-anything` only goes once its holders are safely in `admin`
--    — the EXISTS guard makes the delete a no-op for a congregation where step 1 could
--    not create the target because the key was taken.
DELETE FROM "Role" r
USING "_auto_role" a
WHERE r."id" = a."roleId"
  AND (
      NOT a."isAdminRole"
      OR EXISTS (
          SELECT 1 FROM "Role" target
          WHERE target."congregationId" = a."congregationId"
            AND target."key" = 'admin'
            AND target."isBuiltIn" = true
      )
  );

-- 6. A congregation whose `admin` key was already taken keeps the old shape: step 1 could
--    not create the system role, so step 5 deliberately left `can-do-anything` in place
--    and nobody lost access. That is the safe outcome, but it is also invisible — the
--    congregation silently stays on a shape the rest of the codebase no longer expects,
--    and only a hand-written query would ever reveal it. Leave a trail so it can be found
--    and resolved deliberately.
INSERT INTO "AuditLog" ("action", "entityType", "entityId", "actorId", "actorEmail", "metadata", "congregationId", "createdAt")
SELECT 'permission.admin_role_key_taken',
       'Congregation',
       a."congregationId",
       NULL,
       NULL,
       json_build_object(
           'reason', 'A custom role already uses the key "admin", so the system admin role was not created',
           'legacyRoleKept', 'can-do-anything'
       )::text,
       a."congregationId",
       CURRENT_TIMESTAMP
FROM "_auto_role" a
WHERE a."isAdminRole"
  AND NOT EXISTS (
      SELECT 1 FROM "Role" target
      WHERE target."congregationId" = a."congregationId"
        AND target."key" = 'admin'
        AND target."isBuiltIn" = true
  )
  -- Same explicit re-run guard as step 4: no unique key to conflict on.
  AND NOT EXISTS (
      SELECT 1 FROM "AuditLog" l
      WHERE l."congregationId" = a."congregationId"
        AND l."action" = 'permission.admin_role_key_taken'
  )
GROUP BY a."congregationId";

DROP TABLE "_auto_role";
