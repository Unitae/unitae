import { describe, expect, it } from 'vitest'
import {
  groupTemplateParts,
  hallPartDraft,
  type ListedPart,
  newHallDraft,
  sectionPartDraft,
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
