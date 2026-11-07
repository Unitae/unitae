import { describe, expect, it } from 'vitest'

import { Permission } from '~/shared/types/permission'

import { canEnterPublishersArea } from './area-access'

const none = { responsibleFor: null, deputyFor: null }

describe('canEnterPublishersArea', () => {
  it('admits the publisher, programme and emergency-information permissions', () => {
    for (const permission of [
      Permission.CanViewPublishers,
      Permission.CanViewPrograms,
      Permission.CanViewEmergencyInfo,
      Permission.CanManageEmergencyInfo,
    ]) {
      expect(canEnterPublishersArea(new Set([permission]), none)).toBe(true)
    }
  })

  it('admits a group overseer or assistant without any permission', () => {
    expect(canEnterPublishersArea(new Set(), { responsibleFor: { id: 3 }, deputyFor: null })).toBe(true)
    expect(canEnterPublishersArea(new Set(), { responsibleFor: null, deputyFor: { id: 3 } })).toBe(true)
  })

  it('turns away an edit right that comes without a view right', () => {
    expect(canEnterPublishersArea(new Set([Permission.CanManagePublishers]), none)).toBe(false)
    expect(canEnterPublishersArea(new Set([Permission.CanViewActivity]), null)).toBe(false)
  })
})
