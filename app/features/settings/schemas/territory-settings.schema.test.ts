import { describe, expect, it } from 'vitest'
import { TerritoryKindKey } from '~/features/territories'
import { KIND_ROLES_FIELD_PREFIX, territorySettingsSchema } from './territory-settings.schema'

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
    const result = territorySettingsSchema.parse({})

    expect(result[`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]).toEqual([])
  })

  it('coerces a single posted role id into a list', () => {
    const result = territorySettingsSchema.parse({ [`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]: '7' })

    expect(result[`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]).toEqual([7])
  })

  it('keeps every posted role id when several are checked', () => {
    const result = territorySettingsSchema.parse({
      [`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]: ['7', '9'],
    })

    expect(result[`${KIND_ROLES_FIELD_PREFIX}${TerritoryKindKey.Phone}`]).toEqual([7, 9])
  })
})
