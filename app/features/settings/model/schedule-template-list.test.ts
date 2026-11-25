import { describe, expect, it } from 'vitest'
import {
  groupTemplateParts,
  hallPartDraft,
  idsAfterGroupMove,
  idsAfterTopMove,
  type ListedPart,
  newHallDraft,
  partsInListOrder,
  sectionPartDraft,
  templatePlaces,
  topItems,
} from './schedule-template-list'

const part = (id: number, section: string, durationMin: number | null, track = '', trackOrder = 0): ListedPart => ({
  id,
  name: `P${id}`,
  section,
  track,
  trackOrder,
  order: id,
  durationMin,
})

describe('groupTemplateParts', () => {
  it('runs the parts by section in their order, parts outside any section in their own run', () => {
    const { runs } = groupTemplateParts([
      part(1, '', 5),
      part(2, 'Joyaux', 10),
      part(3, 'Joyaux', 4),
      part(4, 'Vie chrétienne', 30),
      part(5, '', 5),
    ])
    expect(runs.map(run => [run.section, run.parts.map(each => each.id)])).toEqual([
      [null, [1]],
      ['Joyaux', [2, 3]],
      ['Vie chrétienne', [4]],
      [null, [5]],
    ])
    expect(runs.map(run => run.minutes)).toEqual([5, 14, 30, 5])
  })

  it('nests a section’s halls in their order and counts parallel halls once', () => {
    const { runs, total } = groupTemplateParts([
      part(1, 'Applique-toi', 3, 'Salle principale', 1),
      part(2, 'Applique-toi', 4, 'Salle principale', 1),
      part(3, 'Applique-toi', 3, 'Salle B', 2),
      part(4, 'Applique-toi', 5, 'Salle B', 2),
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0]?.halls.map(hall => [hall.name, hall.parts.map(each => each.id), hall.minutes])).toEqual([
      ['Salle principale', [1, 2], 7],
      ['Salle B', [3, 4], 8],
    ])
    expect(runs[0]?.minutes).toBe(8)
    expect(total).toEqual({ count: 4, minutes: 8, withoutDuration: 0 })
  })

  it('counts the parts without a duration apart', () => {
    expect(groupTemplateParts([part(1, 'A', null), part(2, 'A', 10)]).total).toEqual({
      count: 2,
      minutes: 10,
      withoutDuration: 1,
    })
  })

  it('lists a section’s parts outside any hall before its halls, the halls in their own order', () => {
    const { runs } = groupTemplateParts([
      part(1, 'Ministère', 2),
      part(2, 'Ministère', 4, 'Salle B', 2),
      part(3, 'Ministère', 3, 'Salle principale', 1),
      part(4, 'Ministère', 5, 'Salle B', 2),
    ])
    expect(runs[0]?.parts.map(each => each.id)).toEqual([1])
    expect(runs[0]?.halls.map(hall => [hall.name, hall.parts.map(each => each.id)])).toEqual([
      ['Salle principale', [3]],
      ['Salle B', [2, 4]],
    ])
    expect(runs[0]?.minutes).toBe(2 + 9)
  })
})

describe('the drafts of a new part', () => {
  const names = { second: 'Deuxième salle', nth: (number: number) => `Salle ${number}` }
  const ordered = (id: number, order: number, section: string, track = '', trackOrder: number | null = null) => ({
    ...part(id, section, 5, track, trackOrder ?? 0),
    trackOrder,
    order,
  })

  it('goes after the last part of its group, keeping its section and hall', () => {
    const { runs } = groupTemplateParts([
      ordered(1, 3, 'Ministère'),
      ordered(2, 4, 'Ministère', 'Salle principale', 1),
      ordered(3, 6, 'Ministère', 'Salle B', 2),
      ordered(4, 7, 'Ministère', 'Salle B', 2),
    ])
    const [run] = runs
    if (run == null) throw new Error('no run')
    expect(sectionPartDraft(run, 40)).toEqual({ section: 'Ministère', track: '', trackOrder: null, order: 4 })
    expect(hallPartDraft(run, run.halls[1] ?? run.halls[0], 40)).toEqual({
      section: 'Ministère',
      track: 'Salle B',
      trackOrder: 2,
      order: 8,
    })
  })

  it('opens a section’s first parallel hall as its second, the next ones numbered on, after the section', () => {
    const plain = groupTemplateParts([ordered(1, 3, 'Joyaux'), ordered(2, 4, 'Joyaux')]).runs[0]
    const inHalls = groupTemplateParts([
      ordered(1, 3, 'Ministère', 'Salle principale', 1),
      ordered(2, 5, 'Ministère', 'Salle B', 2),
    ]).runs[0]
    if (plain == null || inHalls == null) throw new Error('no run')
    expect(newHallDraft(plain, 40, names)).toEqual({
      section: 'Joyaux',
      track: 'Deuxième salle',
      trackOrder: 2,
      order: 5,
    })
    expect(newHallDraft(inHalls, 40, names)).toEqual({
      section: 'Ministère',
      track: 'Salle 3',
      trackOrder: 3,
      order: 6,
    })
  })
})

describe('the list’s order and places', () => {
  const at = (id: number, order: number, section: string, track = '', trackOrder: number | null = null) => ({
    ...part(id, section, 5, track, trackOrder ?? 0),
    trackOrder,
    order,
  })
  const parts = [
    at(1, 0, ''),
    at(2, 10, 'Ministère', 'Salle B', 2),
    at(3, 5, 'Ministère', 'Salle principale', 1),
    at(4, 3, 'Ministère'),
    at(5, 1, 'Joyaux'),
    at(6, 20, 'Ministère', 'Salle principale', 1),
  ]

  it('walks the parts as the list shows them: a section’s parts outside its halls, then each hall', () => {
    // In their order, as the page reads them.
    const ordered = [...parts].sort((a, b) => a.order - b.order)
    expect(partsInListOrder(ordered).map(each => each.id)).toEqual([1, 5, 4, 3, 6, 2])
  })

  it('offers the sections in order and each section’s halls in their own, once each', () => {
    expect(templatePlaces(parts)).toEqual({
      sections: ['Joyaux', 'Ministère'],
      halls: new Map([
        [
          'Ministère',
          [
            { name: 'Salle principale', trackOrder: 1 },
            { name: 'Salle B', trackOrder: 2 },
          ],
        ],
      ]),
    })
  })

  it('keeps the sections in the list’s order and each section’s halls in hall order, per section', () => {
    const places = templatePlaces([
      at(1, 0, 'Vie chrétienne', 'Salle B', 2),
      at(2, 1, 'Vie chrétienne', 'Salle principale', 1),
      at(3, 2, 'Applique-toi', 'Salle B', 2),
      at(4, 3, 'Applique-toi', 'Salle principale', 1),
      at(5, 4, 'Joyaux'),
    ])
    expect(places.sections).toEqual(['Vie chrétienne', 'Applique-toi', 'Joyaux'])
    expect([...places.halls].map(([section, halls]) => [section, halls.map(hall => hall.name)])).toEqual([
      ['Vie chrétienne', ['Salle principale', 'Salle B']],
      ['Applique-toi', ['Salle principale', 'Salle B']],
    ])
  })

  it('reads a section named like an object’s own property as any other', () => {
    const places = templatePlaces([at(1, 0, 'constructor'), at(2, 1, 'toString', 'Salle B', 2)])
    expect([places.halls.get('constructor'), places.halls.get('toString')]).toEqual([
      undefined,
      [{ name: 'Salle B', trackOrder: 2 }],
    ])
  })
})

describe('reordering', () => {
  const at = (id: number, order: number, section: string, track = '', trackOrder: number | null = null) => ({
    ...part(id, section, 5, track, trackOrder ?? 0),
    trackOrder,
    order,
  })
  // Cantique · Joyaux (Discours, Lecture) · Ministère (Salle principale: A1, A2; Salle B: B1) · Conclusion
  const parts = [
    at(1, 0, ''),
    at(2, 1, 'Joyaux'),
    at(3, 2, 'Joyaux'),
    at(4, 3, 'Ministère', 'Salle principale', 1),
    at(5, 4, 'Ministère', 'Salle B', 2),
    at(6, 5, 'Ministère', 'Salle principale', 1),
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

  it('moves a part outside any section that carries a room on its own, never leaving it out', () => {
    // Written by the meeting type's own form, which still takes any room: « Annexe » outside any section.
    const withRoom = [at(1, 0, ''), at(8, 1, '', 'Annexe', 1), at(2, 2, 'Joyaux'), at(3, 3, 'Joyaux')]
    expect(topItems(withRoom)).toEqual([
      { kind: 'part', id: 1 },
      { kind: 'part', id: 8 },
      { kind: 'section', section: 'Joyaux', run: 1, key: 2 },
    ])
    expect(idsAfterTopMove(withRoom, 2, 0)).toEqual([2, 3, 1, 8])
    expect(idsAfterTopMove(withRoom, 1, 2)).toEqual([1, 2, 3, 8])
  })

  it('moves a section with all its parts, its halls kept together', () => {
    expect(idsAfterTopMove(parts, 2, 1)).toEqual([1, 4, 6, 5, 2, 3, 7])
    expect(idsAfterTopMove(parts, 0, 3)).toEqual([2, 3, 4, 6, 5, 7, 1])
  })

  it('moves nothing to the same place or out of the list', () => {
    expect(idsAfterTopMove(parts, 1, 1)).toBeNull()
    expect(idsAfterTopMove(parts, 0, -1)).toBeNull()
    expect(idsAfterTopMove(parts, 3, 4)).toBeNull()
  })

  it('moves a part within its group only: its section’s parts, or its hall', () => {
    expect(idsAfterGroupMove(parts, 3, 0)).toEqual([1, 3, 2, 4, 6, 5, 7])
    expect(idsAfterGroupMove(parts, 6, 0)).toEqual([1, 2, 3, 6, 4, 5, 7])
    // Alone in its hall, or past its group's end: nowhere to go.
    expect(idsAfterGroupMove(parts, 5, 1)).toBeNull()
    expect(idsAfterGroupMove(parts, 2, 2)).toBeNull()
    // A part outside any section moves at the top, not here.
    expect(idsAfterGroupMove(parts, 1, 0)).toBeNull()
  })
})
