export enum Permission {
  Admin = 'admin',
  BoardViewer = 'board-viewer',
  BoardUploader = 'board-uploader',
  BoardValidator = 'board-validator',
  TerritoriesViewer = 'territories-viewer',
  TerritoriesManager = 'territories-manager',
  ProspectionViewer = 'prospection-viewer',
  ProspectionManager = 'prospection-manager',
  SettingsUserManager = 'settings-user-manager',
  PublisherViewer = 'publisher-viewer',
  PublisherManager = 'publisher-manager',
  EmergencyInfoViewer = 'emergency-info-viewer',
  EmergencyInfoManager = 'emergency-info-manager',
  ActivityViewer = 'activity-viewer',
  ActivityManager = 'activity-manager',
  PioneerGoalManager = 'pioneer-goal-manager',
  ProgramViewer = 'program-viewer',
  ProgramManager = 'program-manager',
  AbsenceViewer = 'absence-viewer',
  ExternalSpeakerViewer = 'external-speaker-viewer',
  ExternalSpeakerManager = 'external-speaker-manager',
  RolesViewer = 'roles-viewer',
  RolesManager = 'roles-manager',
  PermissionsManager = 'permissions-manager',
}

/**
 * The custom-role key that carries each permission on its own.
 *
 * #149 removed the direct user→permission edge; every grant now travels through a
 * role. These are the roles the backfill migration mints for congregations that
 * had direct grants, and the ones the archive importer creates when it meets a
 * pre-#149 `congregation-user-permissions.ndjson`.
 *
 * They are ordinary custom roles once created — renameable, deletable, editable.
 * Keep this table in sync with the VALUES list in
 * `app/database/migrations/20260826000000_drop_direct_user_permissions/migration.sql`
 * and with `AUTO_ROLE_NAMES` in `app/shared/types/role.ts`.
 */
export const AUTO_ROLE_KEY_BY_PERMISSION: Record<Permission, string> = {
  [Permission.Admin]: 'can-do-anything',
  [Permission.BoardViewer]: 'can-view-board-documents',
  [Permission.BoardUploader]: 'can-upload-board-documents',
  [Permission.BoardValidator]: 'can-validate-board-documents',
  [Permission.TerritoriesViewer]: 'can-view-territories',
  [Permission.TerritoriesManager]: 'can-edit-territories',
  [Permission.ProspectionViewer]: 'can-view-prospection',
  [Permission.ProspectionManager]: 'can-edit-prospection',
  [Permission.PublisherViewer]: 'can-view-publishers',
  [Permission.PublisherManager]: 'can-edit-publishers',
  [Permission.EmergencyInfoViewer]: 'can-view-emergency-info',
  [Permission.EmergencyInfoManager]: 'can-edit-emergency-info',
  [Permission.ActivityViewer]: 'can-view-activities',
  [Permission.ActivityManager]: 'can-edit-activities',
  [Permission.PioneerGoalManager]: 'can-manage-pioneer-goals',
  [Permission.ProgramViewer]: 'can-view-programs',
  [Permission.ProgramManager]: 'can-edit-programs',
  [Permission.AbsenceViewer]: 'can-view-absences',
  [Permission.ExternalSpeakerViewer]: 'can-view-external-speakers',
  [Permission.ExternalSpeakerManager]: 'can-edit-external-speakers',
  [Permission.SettingsUserManager]: 'can-manage-users',
  [Permission.RolesViewer]: 'can-view-roles',
  [Permission.RolesManager]: 'can-manage-roles',
  [Permission.PermissionsManager]: 'can-manage-permissions',
}

export function autoRoleKeyForPermission(permissionKey: string): string | null {
  return AUTO_ROLE_KEY_BY_PERMISSION[permissionKey as Permission] ?? null
}
