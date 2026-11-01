import { describe, expect, it } from 'vitest'
import { canRecordPastoralVisit, canViewPastoralVisit } from './pastoral-visit-access'

const NOBODY = {
  hasPublisherViewer: false,
  hasPublisherManager: false,
  myResponsibleGroupId: null,
  myDeputyGroupId: null,
  targetGroupId: 4,
}

describe('canViewPastoralVisit', () => {
  it('lets a publisher viewer see it', () => {
    expect(canViewPastoralVisit({ ...NOBODY, hasPublisherViewer: true })).toBe(true)
  })

  it.each([
    ['overseer', { myResponsibleGroupId: 4 }],
    ['assistant', { myDeputyGroupId: 4 }],
  ])("lets the member's group %s see it", (_role, leads) => {
    expect(canViewPastoralVisit({ ...NOBODY, ...leads })).toBe(true)
  })

  it("hides it from the leader of another group, and from a member in no group's leaders", () => {
    expect(canViewPastoralVisit({ ...NOBODY, myResponsibleGroupId: 5 })).toBe(false)
    expect(canViewPastoralVisit({ ...NOBODY, targetGroupId: null, myResponsibleGroupId: 5 })).toBe(false)
  })
})

describe('canRecordPastoralVisit', () => {
  it('lets a publisher manager record it', () => {
    expect(canRecordPastoralVisit({ ...NOBODY, hasPublisherManager: true })).toBe(true)
  })

  it("lets the member's group overseer and assistant record it", () => {
    expect(canRecordPastoralVisit({ ...NOBODY, myResponsibleGroupId: 4 })).toBe(true)
    expect(canRecordPastoralVisit({ ...NOBODY, myDeputyGroupId: 4 })).toBe(true)
  })

  it('does not let a publisher viewer record it', () => {
    expect(canRecordPastoralVisit({ ...NOBODY, hasPublisherViewer: true })).toBe(false)
  })
})
