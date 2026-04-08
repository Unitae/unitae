import { describe, expect, it } from 'vitest'
import { unserializeSharedEntranceFormValue } from './unserialize-shared-entrance-form-value.server'

describe('unserializeSharedEntranceFormValue', () => {
  it('parse une chaîne de ids séparés par des virgules', () => {
    expect(unserializeSharedEntranceFormValue('1,2,3', 99)).toEqual([1, 2, 3])
  })

  it('parse un seul id', () => {
    expect(unserializeSharedEntranceFormValue('42', 99)).toEqual([42])
  })

  it('retourne le defaultBuildingId quand la valeur est null', () => {
    expect(unserializeSharedEntranceFormValue(null, 7)).toEqual([7])
  })

  it('retourne le defaultBuildingId quand la valeur est une chaîne vide', () => {
    expect(unserializeSharedEntranceFormValue('', 7)).toEqual([7])
  })
})
