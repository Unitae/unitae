import { describe, expect, it } from 'vitest'

import { groupProgrammeParts, sectionDurationMin } from './programme-grouping'

interface TestPart {
  id: number
  section: string
  track: string
  trackOrder: number | null
  durationMin?: number | null
}

function part(
  id: number,
  section: string,
  track = '',
  trackOrder: number | null = null,
  durationMin?: number,
): TestPart {
  return { id, section, track, trackOrder, durationMin }
}

describe('groupProgrammeParts', () => {
  it('keeps sections in programme order and parts in their incoming order', () => {
    const groups = groupProgrammeParts([part(1, ''), part(2, 'Joyaux'), part(3, 'Joyaux'), part(4, 'Ministère')])

    expect(groups.map(g => g.section)).toEqual(['', 'Joyaux', 'Ministère'])
    expect(groups[1].tracks[0].parts.map(p => p.id)).toEqual([2, 3])
  })

  it('clusters a track even when its parts are not contiguous (parallel schedules)', () => {
    // A part appended later to Salle A must join its room, not create a
    // duplicate sub-header.
    const groups = groupProgrammeParts([
      part(1, 'Ministère', 'Salle A'),
      part(2, 'Ministère', 'Salle B'),
      part(3, 'Ministère', 'Salle A'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].tracks.map(t => t.track)).toEqual(['Salle A', 'Salle B'])
    expect(groups[0].tracks[0].parts.map(p => p.id)).toEqual([1, 3])
  })

  it('orders tracks by trackOrder, then first appearance; untracked parts keep their slot', () => {
    const groups = groupProgrammeParts([
      part(1, 'Ministère', ''),
      part(2, 'Ministère', 'Salle B', 2),
      part(3, 'Ministère', 'Salle A', 1),
      part(4, 'Ministère', 'Salle C', null),
    ])

    // '' has no trackOrder but appeared first; ordered tracks come by
    // trackOrder; the orderless named track goes last by appearance.
    expect(groups[0].tracks.map(t => t.track)).toEqual(['', 'Salle A', 'Salle B', 'Salle C'])
  })

  it('starts a new section group when the section repeats later (chronological reality)', () => {
    const groups = groupProgrammeParts([part(1, 'A'), part(2, 'B'), part(3, 'A')])

    expect(groups.map(g => g.section)).toEqual(['A', 'B', 'A'])
  })

  it('returns an empty list for no parts', () => {
    expect(groupProgrammeParts([])).toEqual([])
  })
})

describe('sectionDurationMin', () => {
  it('sums part durations across every track of the section', () => {
    const groups = groupProgrammeParts([
      part(1, 'Ministère', 'Salle A', 1, 10),
      part(2, 'Ministère', 'Salle B', 2, 10),
      part(3, 'Ministère', 'Salle A', 1, 5),
      part(4, 'Ministère', '', null, undefined),
    ])

    expect(sectionDurationMin(groups[0])).toBe(25)
  })

  it('returns null when no part carries a duration', () => {
    const groups = groupProgrammeParts([part(1, 'A'), part(2, 'A')])
    expect(sectionDurationMin(groups[0])).toBeNull()
  })
})
