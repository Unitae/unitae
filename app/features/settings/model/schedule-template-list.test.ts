import { describe, expect, it } from 'vitest'
import {
  groupTemplateParts,
  idsAfterGroupMove,
  idsAfterTopMove,
  type ListedPart,
  partsInListOrder,
  sectionPartDraft,
  templatePlaces,
  topItems,
} from './schedule-template-list'

const at = (id: number, order: number, section: string, durationMin: number | null = 5): ListedPart => ({
  id,
  name: `P${id}`,
  section,
  order,
  durationMin,
})

describe('groupTemplateParts', () => {
  it('runs the parts by section in their order, parts outside any section in their own run', () => {
    const { runs } = groupTemplateParts([
      at(1, 1, '', 5),
      at(2, 2, 'Joyaux', 10),
      at(3, 3, 'Joyaux', 4),
      at(4, 4, 'Vie chrétienne', 30),
      at(5, 5, '', 5),
    ])
    expect(runs.map(run => [run.section, run.parts.map(each => each.id)])).toEqual([
      [null, [1]],
      ['Joyaux', [2, 3]],
      ['Vie chrétienne', [4]],
      [null, [5]],
    ])
    expect(runs.map(run => run.minutes)).toEqual([5, 14, 30, 5])
  })

  it('counts the parts without a duration apart', () => {
    expect(groupTemplateParts([at(1, 1, 'A', null), at(2, 2, 'A', 10)]).total).toEqual({
      count: 2,
      minutes: 10,
      withoutDuration: 1,
    })
  })
})

describe('the draft of a new part', () => {
  it('goes after the last part of its section, keeping its section', () => {
    const [run] = groupTemplateParts([at(1, 3, 'Ministère'), at(2, 6, 'Ministère')]).runs
    if (run == null) throw new Error('no run')
    expect(sectionPartDraft(run, 40)).toEqual({ section: 'Ministère', order: 7 })
  })
})

describe('the list’s order and places', () => {
  const parts = [at(1, 0, ''), at(2, 10, 'Ministère'), at(4, 3, 'Ministère'), at(5, 1, 'Joyaux')]
  const rooms = [{ id: 50, name: null, isMain: true }]

  it('walks the parts as the list shows them', () => {
    const ordered = [...parts].sort((a, b) => a.order - b.order)
    expect(partsInListOrder(ordered).map(each => each.id)).toEqual([1, 5, 4, 2])
  })

  it('offers the sections in the list’s order, once each, and the template’s rooms', () => {
    expect(templatePlaces(parts, rooms)).toEqual({ sections: ['Joyaux', 'Ministère'], rooms })
  })
})

describe('reordering', () => {
  // Cantique · Joyaux (Discours, Lecture) · Ministère (A1, B1, A2) · Conclusion
  const parts = [
    at(1, 0, ''),
    at(2, 1, 'Joyaux'),
    at(3, 2, 'Joyaux'),
    at(4, 3, 'Ministère'),
    at(5, 4, 'Ministère'),
    at(6, 5, 'Ministère'),
    at(7, 6, ''),
  ]

  it('lists the parts outside any section one by one, and each section as one item', () => {
    expect(topItems(parts)).toEqual([
      { kind: 'part', id: 1 },
      { kind: 'section', section: 'Joyaux', run: 1, key: 2 },
      { kind: 'section', section: 'Ministère', run: 2, key: 4 },
      { kind: 'part', id: 7 },
    ])
  })

  it('names a section by its smallest part id, which a move or a rename leaves as it is', () => {
    const moved = idsAfterTopMove(parts, 2, 1) ?? []
    const reordered = moved.map((id, order) => ({ ...(parts.find(each => each.id === id) ?? parts[0]), order }))
    expect(topItems(reordered).filter(item => item.kind === 'section')).toEqual([
      { kind: 'section', section: 'Ministère', run: 1, key: 4 },
      { kind: 'section', section: 'Joyaux', run: 2, key: 2 },
    ])
  })

  it('keeps every part in a top move, a section run twice too', () => {
    const mixed = [at(1, 0, 'Joyaux'), at(2, 1, ''), at(3, 2, 'Joyaux'), at(4, 3, 'Ministère')]
    for (let from = 0; from < topItems(mixed).length; from++) {
      for (let to = 0; to < topItems(mixed).length; to++) {
        const ids = idsAfterTopMove(mixed, from, to)
        if (ids != null) expect([...ids].sort()).toEqual([1, 2, 3, 4])
      }
    }
  })

  it('moves a section with all its parts', () => {
    expect(idsAfterTopMove(parts, 2, 1)).toEqual([1, 4, 5, 6, 2, 3, 7])
    expect(idsAfterTopMove(parts, 0, 3)).toEqual([2, 3, 4, 5, 6, 7, 1])
  })

  it('moves nothing to the same place or out of the list', () => {
    expect(idsAfterTopMove(parts, 1, 1)).toBeNull()
    expect(idsAfterTopMove(parts, 0, -1)).toBeNull()
    expect(idsAfterTopMove(parts, 3, 4)).toBeNull()
  })

  it('moves a part within its section only', () => {
    expect(idsAfterGroupMove(parts, 3, 0)).toEqual([1, 3, 2, 4, 5, 6, 7])
    expect(idsAfterGroupMove(parts, 6, 0)).toEqual([1, 2, 3, 6, 4, 5, 7])
    // Past its section's end: nowhere to go.
    expect(idsAfterGroupMove(parts, 2, 2)).toBeNull()
    // A part outside any section moves at the top, not here, even beside another one.
    expect(idsAfterGroupMove(parts, 1, 0)).toBeNull()
    const twoLoose = [at(1, 0, ''), at(9, 1, ''), at(2, 2, 'Joyaux')]
    expect(idsAfterGroupMove(twoLoose, 9, 0)).toBeNull()
  })
})
