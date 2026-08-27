import * as m from '~/i18n/paraglide/messages'
import { PERMISSION_REQUIRES, Permission } from '~/shared/types/permission'

const PERMISSION_DESCRIPTIONS: Record<Permission, () => string> = {
  [Permission.CanDoAnything]: () => m.permission_desc_can_do_anything(),
  [Permission.CanViewBoard]: () => m.permission_desc_can_view_board(),
  [Permission.CanUploadBoardDocuments]: () => m.permission_desc_can_upload_board_documents(),
  [Permission.CanReviewBoardDocuments]: () => m.permission_desc_can_review_board_documents(),
  [Permission.CanOrganiseBoardDocuments]: () => m.permission_desc_can_organise_board_documents(),
  [Permission.CanConfigureBoardSections]: () => m.permission_desc_can_configure_board_sections(),
  [Permission.CanManageDynamicBoardDocuments]: () => m.permission_desc_can_manage_dynamic_board_documents(),
  [Permission.CanViewTerritories]: () => m.permission_desc_can_view_territories(),
  [Permission.CanManageTerritories]: () => m.permission_desc_can_manage_territories(),
  [Permission.CanViewTerritoryAttributions]: () => m.permission_desc_can_view_territory_attributions(),
  [Permission.CanManageTerritoryAttributions]: () => m.permission_desc_can_manage_territory_attributions(),
  [Permission.CanManageTerritoryCampaigns]: () => m.permission_desc_can_manage_territory_campaigns(),
  [Permission.CanPlanTerritorySplits]: () => m.permission_desc_can_plan_territory_splits(),
  [Permission.CanConfigureTerritorySettings]: () => m.permission_desc_can_configure_territory_settings(),
  [Permission.CanViewProspection]: () => m.permission_desc_can_view_prospection(),
  [Permission.CanRecordProspection]: () => m.permission_desc_can_record_prospection(),
  [Permission.CanManageBuildings]: () => m.permission_desc_can_manage_buildings(),
  [Permission.CanViewPublishers]: () => m.permission_desc_can_view_publishers(),
  [Permission.CanManagePublishers]: () => m.permission_desc_can_manage_publishers(),
  [Permission.CanManagePublisherLifecycle]: () => m.permission_desc_can_manage_publisher_lifecycle(),
  [Permission.CanManagePublisherGroups]: () => m.permission_desc_can_manage_publisher_groups(),
  [Permission.CanViewActivity]: () => m.permission_desc_can_view_activity(),
  [Permission.CanRecordActivity]: () => m.permission_desc_can_record_activity(),
  [Permission.CanCorrectActivity]: () => m.permission_desc_can_correct_activity(),
  [Permission.CanSetPioneerGoals]: () => m.permission_desc_can_set_pioneer_goals(),
  [Permission.CanViewEmergencyInfo]: () => m.permission_desc_can_view_emergency_info(),
  [Permission.CanManageEmergencyInfo]: () => m.permission_desc_can_manage_emergency_info(),
  [Permission.CanViewPrograms]: () => m.permission_desc_can_view_programs(),
  [Permission.CanManagePrograms]: () => m.permission_desc_can_manage_programs(),
  [Permission.CanAssignProgramParts]: () => m.permission_desc_can_assign_program_parts(),
  [Permission.CanPublishPrograms]: () => m.permission_desc_can_publish_programs(),
  [Permission.CanManageProgramTemplates]: () => m.permission_desc_can_manage_program_templates(),
  [Permission.CanViewAbsences]: () => m.permission_desc_can_view_absences(),
  [Permission.CanViewExternalSpeakers]: () => m.permission_desc_can_view_external_speakers(),
  [Permission.CanManageExternalSpeakers]: () => m.permission_desc_can_manage_external_speakers(),
  [Permission.CanViewUsers]: () => m.permission_desc_can_view_users(),
  [Permission.CanManageUsers]: () => m.permission_desc_can_manage_users(),
  [Permission.CanViewRoles]: () => m.permission_desc_can_view_roles(),
  [Permission.CanManageRoles]: () => m.permission_desc_can_manage_roles(),
  [Permission.CanConfigurePermissions]: () => m.permission_desc_can_configure_permissions(),
  [Permission.CanConfigureCongregation]: () => m.permission_desc_can_configure_congregation(),
  [Permission.CanExportCongregationData]: () => m.permission_desc_can_export_congregation_data(),
  [Permission.CanImportCongregationData]: () => m.permission_desc_can_import_congregation_data(),
  [Permission.CanDeleteUserAccounts]: () => m.permission_desc_can_delete_user_accounts(),
  [Permission.CanAnonymisePeople]: () => m.permission_desc_can_anonymise_people(),
}

export function getPermissionDescription(key: string): string {
  return PERMISSION_DESCRIPTIONS[key as Permission]?.() ?? key
}

export const PERMISSION_CATEGORIES = [
  'admin',
  'board',
  'territories',
  'publishers',
  'emergency',
  'programs',
  'settings',
] as const

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number]

const PERMISSION_TO_CATEGORY: Record<Permission, PermissionCategory> = {
  [Permission.CanDoAnything]: 'admin',
  [Permission.CanViewBoard]: 'board',
  [Permission.CanUploadBoardDocuments]: 'board',
  [Permission.CanReviewBoardDocuments]: 'board',
  [Permission.CanOrganiseBoardDocuments]: 'board',
  [Permission.CanConfigureBoardSections]: 'board',
  [Permission.CanManageDynamicBoardDocuments]: 'board',
  [Permission.CanViewTerritories]: 'territories',
  [Permission.CanManageTerritories]: 'territories',
  [Permission.CanViewTerritoryAttributions]: 'territories',
  [Permission.CanManageTerritoryAttributions]: 'territories',
  [Permission.CanManageTerritoryCampaigns]: 'territories',
  [Permission.CanPlanTerritorySplits]: 'territories',
  [Permission.CanConfigureTerritorySettings]: 'territories',
  [Permission.CanViewProspection]: 'territories',
  [Permission.CanRecordProspection]: 'territories',
  [Permission.CanManageBuildings]: 'territories',
  [Permission.CanViewPublishers]: 'publishers',
  [Permission.CanManagePublishers]: 'publishers',
  [Permission.CanManagePublisherLifecycle]: 'publishers',
  [Permission.CanManagePublisherGroups]: 'publishers',
  [Permission.CanViewActivity]: 'publishers',
  [Permission.CanRecordActivity]: 'publishers',
  [Permission.CanCorrectActivity]: 'publishers',
  [Permission.CanSetPioneerGoals]: 'publishers',
  [Permission.CanViewEmergencyInfo]: 'emergency',
  [Permission.CanManageEmergencyInfo]: 'emergency',
  [Permission.CanViewPrograms]: 'programs',
  [Permission.CanManagePrograms]: 'programs',
  [Permission.CanAssignProgramParts]: 'programs',
  [Permission.CanPublishPrograms]: 'programs',
  [Permission.CanManageProgramTemplates]: 'programs',
  [Permission.CanViewAbsences]: 'programs',
  [Permission.CanViewExternalSpeakers]: 'programs',
  [Permission.CanManageExternalSpeakers]: 'programs',
  [Permission.CanViewUsers]: 'settings',
  [Permission.CanManageUsers]: 'settings',
  [Permission.CanViewRoles]: 'settings',
  [Permission.CanManageRoles]: 'settings',
  [Permission.CanConfigurePermissions]: 'settings',
  [Permission.CanConfigureCongregation]: 'settings',
  [Permission.CanExportCongregationData]: 'settings',
  [Permission.CanImportCongregationData]: 'settings',
  [Permission.CanDeleteUserAccounts]: 'settings',
  [Permission.CanAnonymisePeople]: 'settings',
}

export function getPermissionCategory(key: string): PermissionCategory | null {
  return PERMISSION_TO_CATEGORY[key as Permission] ?? null
}

const CATEGORY_LABELS: Record<PermissionCategory, () => string> = {
  admin: () => m.permission_category_admin(),
  board: () => m.permission_category_board(),
  territories: () => m.permission_category_territories(),
  publishers: () => m.permission_category_publishers(),
  emergency: () => m.permission_category_emergency(),
  programs: () => m.permission_category_programs(),
  settings: () => m.permission_category_settings(),
}

export function getPermissionCategoryLabel(category: PermissionCategory): string {
  return CATEGORY_LABELS[category]()
}

/**
 * The permissions this one is inert without, as the descriptions an admin reads.
 *
 * Empty for almost everything: capabilities are meant to stand alone. Where it is not
 * empty the authorisation page says so, but nothing is auto-granted and nothing is
 * blocked — the admin is told, not overruled.
 */
export function getPermissionRequirements(key: string): Array<{ key: Permission; description: string }> {
  const required = PERMISSION_REQUIRES[key as Permission] ?? []
  return required.map(permission => ({ key: permission, description: getPermissionDescription(permission) }))
}
