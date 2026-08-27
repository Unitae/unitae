export enum Permission {
  // Named for what a person can do rather than for a job title, matching how the
  // authorisation screen describes them.
  //
  // Their coarse predecessors (`territories-manager`, `board-validator`, …) are gone
  // from this enum but their rows and grants remain in the database, because the
  // deployed image still resolves permissions by those keys and does not roll when a
  // migration is applied. See 20260827000000_add_capability_permissions.
  CanDoAnything = 'can-do-anything',
  CanViewBoard = 'can-view-board',
  CanUploadBoardDocuments = 'can-upload-board-documents',
  CanReviewBoardDocuments = 'can-review-board-documents',
  CanOrganiseBoardDocuments = 'can-organise-board-documents',
  CanConfigureBoardSections = 'can-configure-board-sections',
  CanManageDynamicBoardDocuments = 'can-manage-dynamic-board-documents',
  CanViewTerritories = 'can-view-territories',
  CanManageTerritories = 'can-manage-territories',
  CanViewTerritoryAttributions = 'can-view-territory-attributions',
  CanManageTerritoryAttributions = 'can-manage-territory-attributions',
  CanManageTerritoryCampaigns = 'can-manage-territory-campaigns',
  CanPlanTerritorySplits = 'can-plan-territory-splits',
  CanConfigureTerritorySettings = 'can-configure-territory-settings',
  CanViewProspection = 'can-view-prospection',
  CanRecordProspection = 'can-record-prospection',
  CanManageBuildings = 'can-manage-buildings',
  CanViewPublishers = 'can-view-publishers',
  CanManagePublishers = 'can-manage-publishers',
  CanManagePublisherLifecycle = 'can-manage-publisher-lifecycle',
  CanManagePublisherGroups = 'can-manage-publisher-groups',
  CanViewActivity = 'can-view-activity',
  CanRecordActivity = 'can-record-activity',
  CanCorrectActivity = 'can-correct-activity',
  CanSetPioneerGoals = 'can-set-pioneer-goals',
  CanViewEmergencyInfo = 'can-view-emergency-info',
  CanManageEmergencyInfo = 'can-manage-emergency-info',
  CanViewPrograms = 'can-view-programs',
  CanManagePrograms = 'can-manage-programs',
  CanAssignProgramParts = 'can-assign-program-parts',
  CanPublishPrograms = 'can-publish-programs',
  CanManageProgramTemplates = 'can-manage-program-templates',
  CanViewAbsences = 'can-view-absences',
  CanViewExternalSpeakers = 'can-view-external-speakers',
  CanManageExternalSpeakers = 'can-manage-external-speakers',
  CanViewUsers = 'can-view-users',
  CanManageUsers = 'can-manage-users',
  CanViewRoles = 'can-view-roles',
  CanManageRoles = 'can-manage-roles',
  CanConfigurePermissions = 'can-configure-permissions',
  CanConfigureCongregation = 'can-configure-congregation',
  CanExportCongregationData = 'can-export-congregation-data',
  CanImportCongregationData = 'can-import-congregation-data',
  CanDeleteUserAccounts = 'can-delete-user-accounts',
  CanAnonymisePeople = 'can-anonymise-people',
}

/**
 * Permissions that are inert without another one.
 *
 * Deliberately short. Most capabilities stand alone — an edit right does not imply a
 * view right, because deletes and bulk actions live on their own pages. An entry here
 * means the screen this permission unlocks cannot function without the other, so the
 * authorisation page tells the admin. Nothing is auto-granted and nothing is blocked.
 */
export const PERMISSION_REQUIRES: Partial<Record<Permission, Permission[]>> = {
  // You cannot assign a territory without being able to pick a publisher.
  [Permission.CanManageTerritoryAttributions]: [Permission.CanViewPublishers],
  // Same for putting someone on a part.
  [Permission.CanAssignProgramParts]: [Permission.CanViewPublishers],
  // The split tool lists territories to work from.
  [Permission.CanPlanTerritorySplits]: [Permission.CanViewTerritories],
  // The permission picker is reached from the role list.
  [Permission.CanConfigurePermissions]: [Permission.CanViewRoles],
}
