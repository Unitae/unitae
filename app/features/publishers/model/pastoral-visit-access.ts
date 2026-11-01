// Access rules for a member's last pastoral visit date. Like the emergency information, two grant
// sources are unioned: congregation-wide permissions (publisher viewer to see it, publisher manager
// to record it) and the group scope: the member's group overseer and assistant see and record it
// with no permission entry. Pure, so they run on client and server and are unit-tested alone.

export type PastoralVisitAccessInput = {
  hasPublisherViewer: boolean
  hasPublisherManager: boolean
  myResponsibleGroupId: number | null
  myDeputyGroupId: number | null
  targetGroupId: number | null
}

function leadsTargetGroup({ targetGroupId, myResponsibleGroupId, myDeputyGroupId }: PastoralVisitAccessInput) {
  if (targetGroupId == null) return false
  return targetGroupId === myResponsibleGroupId || targetGroupId === myDeputyGroupId
}

export function canRecordPastoralVisit(input: PastoralVisitAccessInput): boolean {
  return input.hasPublisherManager || leadsTargetGroup(input)
}

/** Whoever may record the date also sees it. */
export function canViewPastoralVisit(input: PastoralVisitAccessInput): boolean {
  return input.hasPublisherViewer || canRecordPastoralVisit(input)
}
