-- Adds the capability-shaped permissions and grants them to whoever already holds the
-- coarse permission they succeed.
--
-- The old permissions were too blunt to express how a congregation divides its work:
-- `territories-manager` alone gated 57 call sites covering territory CRUD, attributions,
-- campaigns, the split tool, prospection and settings. They were also named like job
-- titles rather than capabilities, which is what the authorisation screen is actually
-- describing.
--
-- CONTRACT: nobody loses anything. Every role holding an old permission receives every
-- permission it splits into, and the old grant stays exactly where it is.
--
-- The old keys are deliberately NOT renamed or removed. `resolveEffectivePermissions`
-- maps `permission.key` straight onto the `Permission` enum, so the moment a key changes
-- the running image matches nothing and every user loses every permission. The main app's
-- image does not roll when a migration is applied (see
-- .claude/skills/unitae-data-migration/SKILL.md), so that window is unbounded. Old and new
-- therefore coexist: the deployed image resolves the old keys, the new image resolves the
-- new ones. A later release retires the old rows once the image has rolled.
--
-- Note on `can-do-anything`: that string was the key of the auto-roles removed in
-- 20260826120000. This is a `Permission` key, not a `Role` key — a different table. The
-- auto-roles have not come back.
--
-- The new `Permission` rows are inserted here rather than left to `seedPermissions()`,
-- which only runs at setup and at congregation registration. On an existing deployment
-- those rows would otherwise not appear until somebody registered a new congregation.
--
-- RLS note: Permission has no congregation column; Role and RolePermission FORCE row
-- level security, but every policy short-circuits to `true` when app.congregation_id is
-- unset (the CASE WHEN NULLIF(...) IS NULL THEN true form). A migration runs with it
-- unset, so these cross-tenant writes are permitted.

-- 1. The capability permissions. Keyed, so re-running is a no-op.
INSERT INTO "Permission" ("key")
SELECT key FROM (VALUES
    ('can-do-anything'),
    ('can-view-board'),
    ('can-upload-board-documents'),
    ('can-review-board-documents'),
    ('can-organise-board-documents'),
    ('can-configure-board-sections'),
    ('can-manage-dynamic-board-documents'),
    ('can-view-territories'),
    ('can-manage-territories'),
    ('can-view-territory-attributions'),
    ('can-manage-territory-attributions'),
    ('can-manage-territory-campaigns'),
    ('can-plan-territory-splits'),
    ('can-configure-territory-settings'),
    ('can-view-prospection'),
    ('can-record-prospection'),
    ('can-manage-buildings'),
    ('can-view-publishers'),
    ('can-manage-publishers'),
    ('can-manage-publisher-lifecycle'),
    ('can-manage-publisher-groups'),
    ('can-view-activity'),
    ('can-record-activity'),
    ('can-correct-activity'),
    ('can-set-pioneer-goals'),
    ('can-view-emergency-info'),
    ('can-manage-emergency-info'),
    ('can-view-programs'),
    ('can-manage-programs'),
    ('can-assign-program-parts'),
    ('can-publish-programs'),
    ('can-manage-program-templates'),
    ('can-view-absences'),
    ('can-view-external-speakers'),
    ('can-manage-external-speakers'),
    ('can-view-users'),
    ('can-manage-users'),
    ('can-view-roles'),
    ('can-manage-roles'),
    ('can-configure-permissions'),
    ('can-configure-congregation'),
    ('can-export-congregation-data'),
    ('can-import-congregation-data'),
    ('can-delete-user-accounts'),
    ('can-anonymise-people')
) AS capability(key)
ON CONFLICT ("key") DO NOTHING;

-- 2. Which new permission succeeds which old one.
--
-- A coarse permission maps to several successors; two old permissions can share one
-- successor (prospection work was split across `prospection-manager` and
-- `territories-manager`, which is the inconsistency this replaces). `program-viewer` gains
-- `can-view-absences` because absences stop being admitted by the programme permission and
-- start requiring their own — without this, every programme viewer would silently lose
-- sight of who is away.
CREATE TEMP TABLE "_succession" ("oldKey" TEXT NOT NULL, "newKey" TEXT NOT NULL);

INSERT INTO "_succession" ("oldKey", "newKey") VALUES
    ('admin', 'can-do-anything'),
    ('admin', 'can-configure-congregation'),
    ('admin', 'can-export-congregation-data'),
    ('admin', 'can-import-congregation-data'),
    ('admin', 'can-delete-user-accounts'),
    ('admin', 'can-anonymise-people'),
    ('admin', 'can-manage-program-templates'),

    ('board-viewer', 'can-view-board'),
    ('board-uploader', 'can-upload-board-documents'),
    ('board-validator', 'can-review-board-documents'),
    ('board-validator', 'can-organise-board-documents'),
    ('board-validator', 'can-configure-board-sections'),
    ('board-validator', 'can-manage-dynamic-board-documents'),

    ('territories-viewer', 'can-view-territories'),
    ('territories-viewer', 'can-view-territory-attributions'),
    ('territories-manager', 'can-manage-territories'),
    ('territories-manager', 'can-manage-territory-attributions'),
    ('territories-manager', 'can-manage-territory-campaigns'),
    ('territories-manager', 'can-plan-territory-splits'),
    ('territories-manager', 'can-configure-territory-settings'),
    ('territories-manager', 'can-record-prospection'),
    ('territories-manager', 'can-manage-buildings'),
    ('prospection-viewer', 'can-view-prospection'),
    ('prospection-manager', 'can-record-prospection'),
    ('prospection-manager', 'can-manage-buildings'),

    ('publisher-viewer', 'can-view-publishers'),
    ('publisher-manager', 'can-manage-publishers'),
    ('publisher-manager', 'can-manage-publisher-lifecycle'),
    ('publisher-manager', 'can-manage-publisher-groups'),
    ('activity-viewer', 'can-view-activity'),
    ('activity-manager', 'can-record-activity'),
    ('activity-manager', 'can-correct-activity'),
    ('pioneer-goal-manager', 'can-set-pioneer-goals'),
    ('emergency-info-viewer', 'can-view-emergency-info'),
    ('emergency-info-manager', 'can-manage-emergency-info'),

    ('program-viewer', 'can-view-programs'),
    ('program-viewer', 'can-view-absences'),
    ('program-manager', 'can-manage-programs'),
    ('program-manager', 'can-assign-program-parts'),
    ('program-manager', 'can-publish-programs'),
    ('program-manager', 'can-manage-program-templates'),
    ('absence-viewer', 'can-view-absences'),
    ('external-speaker-viewer', 'can-view-external-speakers'),
    ('external-speaker-manager', 'can-manage-external-speakers'),

    ('settings-user-manager', 'can-view-users'),
    ('settings-user-manager', 'can-manage-users'),
    ('roles-viewer', 'can-view-roles'),
    ('roles-manager', 'can-manage-roles'),
    ('permissions-manager', 'can-configure-permissions');

-- 3. Grant every successor to every role that holds the permission it succeeds.
--
-- Driven by the join rather than a per-key statement, so a mapping row that names a key
-- which does not exist simply contributes nothing instead of failing the migration. The
-- conflict target is RolePermission's composite primary key, which makes this re-runnable
-- and safe for a role that already reached the successor another way.
INSERT INTO "RolePermission" ("roleId", "permissionId", "congregationId")
SELECT DISTINCT rp."roleId", successor."id", rp."congregationId"
FROM "RolePermission" rp
JOIN "Permission" predecessor ON predecessor."id" = rp."permissionId"
JOIN "_succession" s ON s."oldKey" = predecessor."key"
JOIN "Permission" successor ON successor."key" = s."newKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DROP TABLE "_succession";
