import { Permission } from '~/shared/types/permission'

// `PublisherGroup`'s responsible/deputy are Members, so `myMemberId` must be the
// current user's linked Member id (not their UserAccount id) — passing the wrong
// id space silently denies access. Pure so it can be unit-tested in isolation.

export type GroupActivityAccessInput = {
  hasActivityManager: boolean
  responsibleId: number
  deputyId: number | null
  myMemberId: number | null
}

export function canManageGroupActivity(input: GroupActivityAccessInput): boolean {
  if (input.hasActivityManager) return true
  if (input.myMemberId == null) return false
  return input.responsibleId === input.myMemberId || input.deputyId === input.myMemberId
}

/**
 * Whether the caller may record or correct anyone's monthly activity, not only his own group's:
 * the activity permission, or managing publishers.
 */
export function canRecordAnyActivity(permissions: ReadonlySet<Permission>): boolean {
  return permissions.has(Permission.CanRecordActivity) || permissions.has(Permission.CanManagePublishers)
}

/**
 * Whether the caller may change or delete anyone's filed report, not only his own group's: the
 * correction permission, or managing publishers. Recording a new report is a separate right
 * (canRecordAnyActivity).
 */
export function canCorrectAnyActivity(permissions: ReadonlySet<Permission>): boolean {
  return permissions.has(Permission.CanCorrectActivity) || permissions.has(Permission.CanManagePublishers)
}

export interface ReportAccessInput {
  permissions: ReadonlySet<Permission>
  /** The groups the caller leads, from his linked member: overseer of one, deputy of another. */
  leader: { responsibleForId: number | null; deputyForId: number | null } | null
  /** The group of the publisher whose report it is. */
  publisherGroupId: number | null
}

export interface ReportAccess {
  /** May file this publisher's missing report. */
  canRecord: boolean
  /** May change this publisher's filed report. */
  canCorrect: boolean
  /** May see and set the hour credit: the secretary only. Group overseers describe it in the observations. */
  canGrantCredit: boolean
  /** May delete a filed report. */
  canDelete: boolean
}

/**
 * What the caller may do with one publisher's monthly report. A group's overseer or deputy records and corrects his
 * own group's reports only; the activity permissions cover everyone. The report panel's loader and its action both
 * ask this, so reading a report and saving it cannot disagree.
 */
export function reportAccess({ permissions, leader, publisherGroupId }: ReportAccessInput): ReportAccess {
  const leadsTheGroup =
    leader != null &&
    publisherGroupId != null &&
    (leader.responsibleForId === publisherGroupId || leader.deputyForId === publisherGroupId)

  return {
    canRecord: canRecordAnyActivity(permissions) || leadsTheGroup,
    canCorrect: canCorrectAnyActivity(permissions) || leadsTheGroup,
    canGrantCredit: permissions.has(Permission.CanCorrectActivity),
    canDelete: permissions.has(Permission.CanCorrectActivity),
  }
}
