// Whether a user may manage a publisher group's activity: either they hold the
// global Activity Manager permission, or they are that group's responsible or
// deputy. The scope check runs on the **Member** id — `PublisherGroup`'s
// responsible/deputy are Members, so callers must pass the current user's
// linked Member id (not their UserAccount id). Pure so it can be unit-tested in
// isolation.

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
