import { Permission } from '~/shared/types/permission'

import { canManageEmergencyInfo, canViewEmergencyInfo } from './emergency-access'
import { canRecordPastoralVisit } from './pastoral-visit-access'

export interface RecordViewer {
  /** The reader's own member, when their account has one. */
  memberId: number | null
  /** The groups they lead: overseer of one, assistant of another. */
  responsibleForId: number | null
  deputyForId: number | null
}

export interface PublisherRecordRights {
  canEdit: boolean
  canManageLogin: boolean
  canManageLifecycle: boolean
  /** The reader is on their own record: their own status is someone else's to change. */
  isSelf: boolean
  canDownloadS21: boolean
  canViewActivity: boolean
  canSeeEnrolments: boolean
  canManageEnrolments: boolean
  canViewAttributions: boolean
  canOpenTerritories: boolean
  canViewPrograms: boolean
  canViewAbsences: boolean
  canViewEmergency: boolean
  canManageEmergency: boolean
  canRecordVisit: boolean
}

/**
 * Who sees and does what on a publisher's record. Each block follows the right of the page or route it comes from, so
 * the record never shows more than they would, nor offers an action its route refuses: the status menu follows the
 * status routes, the S-21 its export, the territories the attributions list. Reading the record itself is the
 * caller's to check (`CanViewPublishers`).
 */
export function publisherRecordRights(
  permissions: ReadonlySet<Permission>,
  person: { id: number; groupId: number | null },
  viewer: RecordViewer,
): PublisherRecordRights {
  const has = (permission: Permission) => permissions.has(permission)
  const groupAccess = {
    myResponsibleGroupId: viewer.responsibleForId,
    myDeputyGroupId: viewer.deputyForId,
    targetGroupId: person.groupId,
  }
  const emergency = {
    ...groupAccess,
    hasViewer: has(Permission.CanViewEmergencyInfo),
    hasManager: has(Permission.CanManageEmergencyInfo),
  }
  const canManagePublishers = has(Permission.CanManagePublishers)
  const canViewActivity = has(Permission.CanViewActivity)

  return {
    canEdit: canManagePublishers,
    canManageLogin: canManagePublishers,
    canManageLifecycle: has(Permission.CanManagePublisherLifecycle),
    isSelf: viewer.memberId === person.id,
    canDownloadS21: has(Permission.CanRecordActivity),
    canViewActivity,
    canSeeEnrolments: canViewActivity || canManagePublishers,
    canManageEnrolments: canManagePublishers,
    canViewAttributions: has(Permission.CanViewTerritoryAttributions),
    canOpenTerritories: has(Permission.CanViewTerritories),
    canViewPrograms: has(Permission.CanViewPrograms),
    canViewAbsences: has(Permission.CanViewAbsences),
    canViewEmergency: canViewEmergencyInfo(emergency),
    canManageEmergency: canManageEmergencyInfo(emergency),
    canRecordVisit: canRecordPastoralVisit({
      ...groupAccess,
      hasPublisherViewer: has(Permission.CanViewPublishers),
      hasPublisherManager: canManagePublishers,
    }),
  }
}
