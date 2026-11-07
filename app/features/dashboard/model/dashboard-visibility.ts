import { canEnterPublishersArea, canRecordAnyActivity } from '~/features/publishers'
import { canEnterTerritoriesArea } from '~/features/territories'
import { Permission } from '~/shared/types/permission'

export interface DashboardViewer {
  permissions: ReadonlySet<Permission>
  /** The linked member record; accounts without one (sign-up admin, circuit overseer) hold no parts. */
  member: {
    publisherGroupId: number | null
    responsibleFor: { id: number } | null
    deputyFor: { id: number } | null
  } | null
}

/**
 * Which dashboard blocks a viewer gets, and which actions each offers. A block is null when the
 * viewer holds no responsibility for it: figures follow responsibilities, never mere read access.
 * Every action is one the destination page would accept, area entry gates included, so the
 * dashboard never links someone to a page that sends them back.
 */
export interface DashboardVisibility {
  /** Own assignments, territories and absences. */
  personal: boolean
  /**
   * The next meeting's schedule, read-only. Programme viewers see it as they would in the
   * programmes; board viewers only when its board document is visible to them (checked on the
   * server). Acting on it (conflicts, filling a slot) is decided per meeting on the server.
   */
  meetingAudience: 'programmes' | 'board' | null
  /** Absence conflicts on meetings the viewer answers for: only where the programmes open. */
  responsibleConflicts: boolean
  /** Open slots in the coming weeks, for meetings the viewer may fill (resolved on the server). */
  programmes: { canCreate: boolean } | null
  territories: { canAssign: boolean } | null
  activity: { canRecord: boolean; canOpenPioneers: boolean; canOpenPublisher: boolean } | null
  /** Arrivals and departures, for those who keep the publisher roll. */
  roll: { canCreate: boolean } | null
  /** The group the viewer oversees or assists. */
  group: { groupId: number; canRecord: boolean } | null
  documents: { canUpload: boolean } | null
  /** The administrator's setup checklist. */
  setup: boolean
  /** Two-factor sign-in is worth suggesting to anyone who holds a responsibility. */
  suggestTwoFactor: boolean
}

export function dashboardVisibility({ permissions, member }: DashboardViewer): DashboardVisibility {
  const has = (permission: Permission) => permissions.has(permission)
  const inPublishersArea = canEnterPublishersArea(permissions, member)
  const inTerritoriesArea = canEnterTerritoriesArea(permissions)
  const ledGroupId = member?.responsibleFor?.id ?? member?.deputyFor?.id ?? null

  return {
    personal: member != null,
    meetingAudience: has(Permission.CanViewPrograms) ? 'programmes' : has(Permission.CanViewBoard) ? 'board' : null,
    responsibleConflicts: has(Permission.CanViewPrograms),
    programmes: has(Permission.CanViewPrograms) ? { canCreate: has(Permission.CanManagePrograms) } : null,
    territories:
      has(Permission.CanViewTerritoryAttributions) && inTerritoriesArea
        ? { canAssign: has(Permission.CanManageTerritoryAttributions) }
        : null,
    activity: has(Permission.CanViewActivity)
      ? {
          canRecord: inPublishersArea && canRecordAnyActivity(permissions),
          canOpenPioneers: inPublishersArea,
          canOpenPublisher: has(Permission.CanViewPublishers),
        }
      : null,
    roll: has(Permission.CanManagePublishers) && inPublishersArea ? { canCreate: true } : null,
    group:
      ledGroupId != null
        ? {
            groupId: ledGroupId,
            // The report form lets a leader in for the group he belongs to, or anyone who records activity.
            canRecord: canRecordAnyActivity(permissions) || member?.publisherGroupId === ledGroupId,
          }
        : null,
    documents: has(Permission.CanViewBoard) ? { canUpload: has(Permission.CanUploadBoardDocuments) } : null,
    setup: has(Permission.CanDoAnything),
    suggestTwoFactor: Object.values(Permission).some(p => p !== Permission.CanViewBoard && has(p)),
  }
}
