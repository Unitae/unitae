import * as m from '~/i18n/paraglide/messages'
import { Permission } from '~/shared/types/permission'

const PERMISSION_DESCRIPTIONS: Record<Permission, () => string> = {
  [Permission.Admin]: () => m.permission_desc_admin(),
  [Permission.BoardUploader]: () => m.permission_desc_board_uploader(),
  [Permission.BoardValidator]: () => m.permission_desc_board_validator(),
  [Permission.TerritoriesViewer]: () => m.permission_desc_territories_viewer(),
  [Permission.TerritoriesManager]: () => m.permission_desc_territories_manager(),
  [Permission.SettingsUserManager]: () => m.permission_desc_settings_user_manager(),
  [Permission.PublisherViewer]: () => m.permission_desc_publisher_viewer(),
  [Permission.PublisherManager]: () => m.permission_desc_publisher_manager(),
  [Permission.ActivityManager]: () => m.permission_desc_activity_manager(),
  [Permission.ActivityViewer]: () => m.permission_desc_activity_viewer(),
  [Permission.ProgramViewer]: () => m.permission_desc_program_viewer(),
  [Permission.ProgramManager]: () => m.permission_desc_program_manager(),
  [Permission.ProspectionViewer]: () => m.permission_desc_prospection_viewer(),
  [Permission.ProspectionManager]: () => m.permission_desc_prospection_manager(),
  [Permission.ExternalSpeakerViewer]: () => m.permission_desc_external_speaker_viewer(),
  [Permission.ExternalSpeakerManager]: () => m.permission_desc_external_speaker_manager(),
  [Permission.RolesViewer]: () => m.permission_desc_roles_viewer(),
  [Permission.RolesManager]: () => m.permission_desc_roles_manager(),
  [Permission.PermissionsManager]: () => m.permission_desc_permissions_manager(),
}

export function getPermissionDescription(key: string): string {
  return PERMISSION_DESCRIPTIONS[key as Permission]?.() ?? key
}

export const PERMISSION_CATEGORIES = [
  'admin',
  'board',
  'territories',
  'publishers',
  'programs',
  'settings',
] as const

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number]

const PERMISSION_TO_CATEGORY: Record<Permission, PermissionCategory> = {
  [Permission.Admin]: 'admin',
  [Permission.BoardUploader]: 'board',
  [Permission.BoardValidator]: 'board',
  [Permission.TerritoriesViewer]: 'territories',
  [Permission.TerritoriesManager]: 'territories',
  [Permission.ProspectionViewer]: 'territories',
  [Permission.ProspectionManager]: 'territories',
  [Permission.PublisherViewer]: 'publishers',
  [Permission.PublisherManager]: 'publishers',
  [Permission.ActivityViewer]: 'publishers',
  [Permission.ActivityManager]: 'publishers',
  [Permission.ProgramViewer]: 'programs',
  [Permission.ProgramManager]: 'programs',
  [Permission.ExternalSpeakerViewer]: 'programs',
  [Permission.ExternalSpeakerManager]: 'programs',
  [Permission.SettingsUserManager]: 'settings',
  [Permission.RolesViewer]: 'settings',
  [Permission.RolesManager]: 'settings',
  [Permission.PermissionsManager]: 'settings',
}

export function getPermissionCategory(key: string): PermissionCategory | null {
  return PERMISSION_TO_CATEGORY[key as Permission] ?? null
}

const CATEGORY_LABELS: Record<PermissionCategory, () => string> = {
  admin: () => m.permission_category_admin(),
  board: () => m.permission_category_board(),
  territories: () => m.permission_category_territories(),
  publishers: () => m.permission_category_publishers(),
  programs: () => m.permission_category_programs(),
  settings: () => m.permission_category_settings(),
}

export function getPermissionCategoryLabel(category: PermissionCategory): string {
  return CATEGORY_LABELS[category]()
}
