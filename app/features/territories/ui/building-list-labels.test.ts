import { describe, expect, it } from 'vitest'
import * as m from '~/i18n/paraglide/messages'
import { TerritoryAccess } from '../model/territory-access.type'
import { buildingContentLabel, buildingReasonLabel, buildingStateLabel, monthsBetween } from './building-list-labels'

const NONE = { homes: 0, phones: 0, access: null, commerces: 0, hotels: 0, campuses: 0 }

describe('buildingContentLabel', () => {
  it('says what the building holds and how to get in', () => {
    expect(buildingContentLabel({ ...NONE, homes: 24, access: TerritoryAccess.Intercom })).toBe(
      `${m.prospection_content_homes({ count: 24 })} · ${m.prospection_entrance_access_intercom()}`,
    )
    expect(buildingContentLabel({ ...NONE, homes: 1 })).toBe(m.prospection_content_home())
    expect(buildingContentLabel({ ...NONE, commerces: 3 })).toBe(m.prospection_content_shops({ count: 3 }))
    expect(buildingContentLabel({ ...NONE, hotels: 1 })).toBe(m.prospection_content_hotel())
  })

  it('says nothing until something is known', () => {
    expect(buildingContentLabel(NONE)).toBeNull()
    expect(buildingContentLabel({ ...NONE, access: TerritoryAccess.Code })).toBeNull()
  })
})

describe('monthsBetween', () => {
  it('counts whole months only', () => {
    expect(monthsBetween(new Date('2025-03-03'), new Date('2025-04-02'))).toBe(0)
    expect(monthsBetween(new Date('2025-03-03'), new Date('2025-04-03'))).toBe(1)
    expect(monthsBetween(new Date('2024-01-12'), new Date('2026-11-10'))).toBe(33)
  })
})

describe('buildingReasonLabel', () => {
  it('says how long ago a stale prospection was', () => {
    expect(buildingReasonLabel('stale', new Date('2024-01-12'), new Date('2026-11-10'))).toBe(
      m.prospection_reason_stale({ months: 33 }),
    )
  })
})

describe('buildingStateLabel', () => {
  it('tells an inactive building from one outside the territory', () => {
    expect(buildingStateLabel({ state: 'off', active: false })).toBe(m.prospection_state_inactive())
    expect(buildingStateLabel({ state: 'off', active: true })).toBe(m.prospection_state_outside())
  })
})
