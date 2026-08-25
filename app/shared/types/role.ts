import * as m from '~/i18n/paraglide/messages'

interface RoleDisplay {
  key: string
  name: string | null
  description?: string | null
}

const BUILT_IN_NAMES: Record<string, () => string> = {
  member: () => m.role_name_member(),
  'ministry-school-student': () => m.role_name_ministry_school_student(),
  publisher: () => m.role_name_publisher(),
  baptized: () => m.role_name_baptized(),
  brother: () => m.role_name_brother(),
  sister: () => m.role_name_sister(),
  anointed: () => m.role_name_anointed(),
  elder: () => m.role_name_elder(),
  'assistant-servant': () => m.role_name_assistant_servant(),
  pioneer: () => m.role_name_pioneer(),
}

const BUILT_IN_DESCRIPTIONS: Record<string, () => string> = {
  member: () => m.role_desc_member(),
  'ministry-school-student': () => m.role_desc_ministry_school_student(),
  publisher: () => m.role_desc_publisher(),
  baptized: () => m.role_desc_baptized(),
  brother: () => m.role_desc_brother(),
  sister: () => m.role_desc_sister(),
  anointed: () => m.role_desc_anointed(),
  elder: () => m.role_desc_elder(),
  'assistant-servant': () => m.role_desc_assistant_servant(),
  pioneer: () => m.role_desc_pioneer(),
}

/**
 * Display names for the auto-roles #149 mints, one per permission, when it
 * migrates a congregation's direct grants.
 *
 * They are stored with a null `name` so no language is pinned into the database
 * — the same convention built-in roles use. An admin who renames one sets
 * `name`, and the branch below hands the win to their choice.
 *
 * The `-migrated` / `-migrated-<id>` variants exist for congregations that
 * already owned a role under the base key; they fall through to the raw key,
 * which is exactly the signal an admin needs that two roles collided.
 *
 * Keep in sync with `AUTO_ROLE_KEY_BY_PERMISSION` in `permission.ts`.
 */
const AUTO_ROLE_NAMES: Record<string, () => string> = {
  'can-do-anything': () => m.role_name_can_do_anything(),
  'can-view-board-documents': () => m.role_name_can_view_board_documents(),
  'can-upload-board-documents': () => m.role_name_can_upload_board_documents(),
  'can-validate-board-documents': () => m.role_name_can_validate_board_documents(),
  'can-view-territories': () => m.role_name_can_view_territories(),
  'can-edit-territories': () => m.role_name_can_edit_territories(),
  'can-view-prospection': () => m.role_name_can_view_prospection(),
  'can-edit-prospection': () => m.role_name_can_edit_prospection(),
  'can-view-publishers': () => m.role_name_can_view_publishers(),
  'can-edit-publishers': () => m.role_name_can_edit_publishers(),
  'can-view-emergency-info': () => m.role_name_can_view_emergency_info(),
  'can-edit-emergency-info': () => m.role_name_can_edit_emergency_info(),
  'can-view-activities': () => m.role_name_can_view_activities(),
  'can-edit-activities': () => m.role_name_can_edit_activities(),
  'can-manage-pioneer-goals': () => m.role_name_can_manage_pioneer_goals(),
  'can-view-programs': () => m.role_name_can_view_programs(),
  'can-edit-programs': () => m.role_name_can_edit_programs(),
  'can-view-absences': () => m.role_name_can_view_absences(),
  'can-view-external-speakers': () => m.role_name_can_view_external_speakers(),
  'can-edit-external-speakers': () => m.role_name_can_edit_external_speakers(),
  'can-manage-users': () => m.role_name_can_manage_users(),
  'can-view-roles': () => m.role_name_can_view_roles(),
  'can-manage-roles': () => m.role_name_can_manage_roles(),
  'can-manage-permissions': () => m.role_name_can_manage_permissions(),
}

export function getRoleDisplayName(role: RoleDisplay): string {
  if (role.name) return role.name
  return BUILT_IN_NAMES[role.key]?.() ?? AUTO_ROLE_NAMES[role.key]?.() ?? role.key
}

export function getRoleDescription(role: RoleDisplay): string {
  if (role.description) return role.description
  return BUILT_IN_DESCRIPTIONS[role.key]?.() ?? ''
}
