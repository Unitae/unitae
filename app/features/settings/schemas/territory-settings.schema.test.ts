import { describe, expect, it } from 'vitest'
import { TerritoryKindKey } from '~/features/territories'
import { KIND_ROLES_FIELD_PREFIX, territorySettingsSchema } from './territory-settings.schema'

// The durations every save carries.
const BASE = {
  'prospection-validity': '24',
  'attribution-default-duration': '120',
  'attribution-phone-duration': '14',
  'attribution-commerce-duration': '120',
}

describe('territorySettingsSchema — per-kind role fields', () => {
  // The five kind fields are hand-spelled so the parsed value stays typed. That
  // makes them driftable: add a kind to the enum, forget the schema, and the
  // form silently drops that kind's roles on every save. This is the guard.
  it('declares a role field for every territory kind', () => {
    const declared = Object.keys(territorySettingsSchema.shape).filter(key => key.startsWith(KIND_ROLES_FIELD_PREFIX))
    const expected = Object.values(TerritoryKindKey).map(key => `${KIND_ROLES_FIELD_PREFIX}${key}`)

    expect(declared.sort()).toEqual(expected.sort())
  })

  it('reads a cleared checkbox group as an explicit "no restriction"', () => {
    const result = territorySettingsSchema.parse(BASE)

    expect(result[`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]).toEqual([])
  })

  it('coerces a single posted role id into a list', () => {
    const result = territorySettingsSchema.parse({
      ...BASE,
      [`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]: '7',
    })

    expect(result[`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]).toEqual([7])
  })

  it('keeps every posted role id when several are checked', () => {
    const result = territorySettingsSchema.parse({
      ...BASE,
      [`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]: ['7', '9'],
    })

    expect(result[`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]).toEqual([7, 9])
  })
})

describe('territorySettingsSchema — pmr-active', () => {
  it('reads a ticked checkbox as on', () => {
    expect(territorySettingsSchema.parse({ ...BASE, 'pmr-active': 'on' })['pmr-active']).toBe(true)
  })

  it('reads an unticked (absent) checkbox as off', () => {
    expect(territorySettingsSchema.parse(BASE)['pmr-active']).toBe(false)
  })
})

describe('territorySettingsSchema — durations', () => {
  it('refuses a blank validity instead of saving 0 months', () => {
    expect(territorySettingsSchema.safeParse({ ...BASE, 'prospection-validity': '' }).success).toBe(false)
  })

  it('refuses a duration of 0 days', () => {
    expect(territorySettingsSchema.safeParse({ ...BASE, 'attribution-phone-duration': '0' }).success).toBe(false)
  })
})
