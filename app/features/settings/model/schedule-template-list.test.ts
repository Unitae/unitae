import { describe, expect, it } from 'vitest'
import { groupTemplateParts, type ListedPart } from './schedule-template-list'

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
})
