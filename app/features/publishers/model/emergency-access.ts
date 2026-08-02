// Access rules for a publisher's emergency information.
//
// Two orthogonal grant sources, unioned: global permissions
// (EmergencyInfoViewer / EmergencyInfoManager) that apply congregation-wide,
// and a derived *group scope* — being the responsible or deputy of the target
// publisher's group grants view + edit for that group only, with no permission
// entry. Mirrors the `canManageMyGroupActivity` precedent in the activity
// entry form. Pure functions so they can run on client and server and be
// unit-tested in isolation.

export type EmergencyAccessInput = {
  hasViewer: boolean
  hasManager: boolean
  myResponsibleGroupId: number | null
  myDeputyGroupId: number | null
  targetGroupId: number | null
}

function isResponsibleOrDeputyOfTargetGroup(input: EmergencyAccessInput): boolean {
  const { targetGroupId, myResponsibleGroupId, myDeputyGroupId } = input
  if (targetGroupId == null) return false
  return targetGroupId === myResponsibleGroupId || targetGroupId === myDeputyGroupId
}

export function canViewEmergencyInfo(input: EmergencyAccessInput): boolean {
  return input.hasViewer || input.hasManager || isResponsibleOrDeputyOfTargetGroup(input)
}

export function canManageEmergencyInfo(input: EmergencyAccessInput): boolean {
  return input.hasManager || isResponsibleOrDeputyOfTargetGroup(input)
}
