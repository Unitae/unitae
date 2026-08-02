import { describe, expect, it } from 'vitest'
import { canManageEmergencyInfo, canViewEmergencyInfo, type EmergencyAccessInput } from './emergency-access'

const base: EmergencyAccessInput = {
  hasViewer: false,
  hasManager: false,
  myResponsibleGroupId: null,
  myDeputyGroupId: null,
  targetGroupId: null,
}

describe('canViewEmergencyInfo', () => {
  it('grants view to a global viewer regardless of group', () => {
    expect(canViewEmergencyInfo({ ...base, hasViewer: true, targetGroupId: 7 })).toBe(true)
  })

  it('grants view to a global manager regardless of group', () => {
    expect(canViewEmergencyInfo({ ...base, hasManager: true, targetGroupId: 7 })).toBe(true)
  })

  it('grants view to the responsible of the target group', () => {
    expect(canViewEmergencyInfo({ ...base, myResponsibleGroupId: 7, targetGroupId: 7 })).toBe(true)
  })

  it('grants view to the deputy of the target group', () => {
    expect(canViewEmergencyInfo({ ...base, myDeputyGroupId: 7, targetGroupId: 7 })).toBe(true)
  })

  it('denies view to a responsible of a different group', () => {
    expect(canViewEmergencyInfo({ ...base, myResponsibleGroupId: 7, targetGroupId: 8 })).toBe(false)
  })

  it('denies view to someone with no permission and no matching group', () => {
    expect(canViewEmergencyInfo({ ...base, targetGroupId: 7 })).toBe(false)
  })

  it('does not match a responsible group when the target has no group', () => {
    // A member with no group must not be reachable just because the viewer leads *some* group.
    expect(canViewEmergencyInfo({ ...base, myResponsibleGroupId: 7, targetGroupId: null })).toBe(false)
  })
})

describe('canManageEmergencyInfo', () => {
  it('denies manage to a global viewer (read-only)', () => {
    expect(canManageEmergencyInfo({ ...base, hasViewer: true, targetGroupId: 7 })).toBe(false)
  })

  it('grants manage to a global manager', () => {
    expect(canManageEmergencyInfo({ ...base, hasManager: true, targetGroupId: 7 })).toBe(true)
  })

  it('grants manage to the responsible of the target group', () => {
    expect(canManageEmergencyInfo({ ...base, myResponsibleGroupId: 7, targetGroupId: 7 })).toBe(true)
  })

  it('grants manage to the deputy of the target group', () => {
    expect(canManageEmergencyInfo({ ...base, myDeputyGroupId: 7, targetGroupId: 7 })).toBe(true)
  })

  it('denies manage to the responsible of a different group', () => {
    expect(canManageEmergencyInfo({ ...base, myResponsibleGroupId: 7, targetGroupId: 8 })).toBe(false)
  })
})
