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
