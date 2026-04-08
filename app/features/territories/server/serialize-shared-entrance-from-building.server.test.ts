import { describe, expect, it } from 'vitest'
import { serializeSharedEntranceFromBuilding } from './serialize-shared-entrance-from-building.server'

describe('serializeSharedEntranceFromBuilding', () => {
  it('retourne les ids des bâtiments séparés par des virgules', () => {
    const building = {
      entrance: {
        buildings: [{ id: 1 }, { id: 2 }, { id: 3 }],
      },
    }

    expect(serializeSharedEntranceFromBuilding(building as never)).toBe('1,2,3')
  })

  it('retourne un seul id pour un bâtiment unique', () => {
    const building = {
      entrance: {
        buildings: [{ id: 42 }],
      },
    }

    expect(serializeSharedEntranceFromBuilding(building as never)).toBe('42')
  })

  it('retourne une chaîne vide pour un building null', () => {
    expect(serializeSharedEntranceFromBuilding(null)).toBe('')
  })

  it('retourne une chaîne vide quand entrance est null', () => {
    const building = { entrance: null }
    expect(serializeSharedEntranceFromBuilding(building as never)).toBe('')
  })

  it('retourne une chaîne vide pour une liste de bâtiments vide', () => {
    const building = { entrance: { buildings: [] } }
    expect(serializeSharedEntranceFromBuilding(building as never)).toBe('')
  })
})
