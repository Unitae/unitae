import { describe, expect, it } from 'vitest'

import { groupPartsBySlot } from './group-parts-by-slot'

type Part = { id: number; section: string; order: number; track: string }

function makePart(id: number, section: string, order: number, track = ''): Part {
  return { id, section, order, track }
}

describe('groupPartsBySlot', () => {
  it('regroupe des parties en une seule section linéaire', () => {
    const parts: Part[] = [makePart(1, 'Tresors', 1), makePart(2, 'Tresors', 2), makePart(3, 'Tresors', 3)]

    const result = groupPartsBySlot(parts)

    expect(result).toHaveLength(1)
    expect(result[0].section).toBe('Tresors')
    expect(result[0].slots).toHaveLength(3)
    expect(result[0].slots.every(s => s.parts.length === 1)).toBe(true)
  })

  it('regroupe les parties partageant le même `order` dans un slot parallèle', () => {
    const parts: Part[] = [
      makePart(1, 'Ministere', 5, 'Salle principale'),
      makePart(2, 'Ministere', 5, 'Enfants'),
      makePart(3, 'Ministere', 6),
    ]

    const result = groupPartsBySlot(parts)

    expect(result).toHaveLength(1)
    expect(result[0].slots).toHaveLength(2)
    expect(result[0].slots[0].parts).toHaveLength(2)
    expect(result[0].slots[0].parts.map(p => p.track)).toEqual(['Salle principale', 'Enfants'])
    expect(result[0].slots[1].parts).toHaveLength(1)
  })

  it('sépare les sections non-contiguës même si elles portent le même nom', () => {
    const parts: Part[] = [
      makePart(1, 'Cantique', 1),
      makePart(2, 'Tresors', 2),
      makePart(3, 'Cantique', 3),
      makePart(4, 'Vie', 4),
      makePart(5, 'Cantique', 5),
    ]

    const result = groupPartsBySlot(parts)

    expect(result.map(g => g.section)).toEqual(['Cantique', 'Tresors', 'Cantique', 'Vie', 'Cantique'])
  })

  it('trie les parties par order avant de regrouper', () => {
    const parts: Part[] = [makePart(3, 'Tresors', 3), makePart(1, 'Tresors', 1), makePart(2, 'Tresors', 2)]

    const result = groupPartsBySlot(parts)

    expect(result[0].slots.map(s => s.order)).toEqual([1, 2, 3])
  })

  it('retourne un tableau vide pour une liste vide', () => {
    expect(groupPartsBySlot([])).toEqual([])
  })
})
