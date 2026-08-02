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
