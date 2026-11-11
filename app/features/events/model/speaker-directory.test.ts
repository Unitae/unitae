import { describe, expect, it } from 'vitest'
import type { DirectoryCongregation, DirectorySpeaker, SpeakerDirectory } from './external-speaker.type'
import { buildSpeakerGroups, isIncomplete, isListStale, isResponsible, speakerCounts } from './speaker-directory'

function congregation(id: number, name: string, listDate: Date | null = null): DirectoryCongregation {
  return {
    id,
    name,
    responsibleName: '',
    responsiblePhone: '',
    responsibleEmail: '',
    coordinatorName: '',
    coordinatorPhone: '',
    coordinatorEmail: '',
    listDate,
    listFileName: null,
    notes: '',
  }
}

function speaker(
  id: number,
  name: string,
  speakerCongregationId: number | null,
  extra: Partial<DirectorySpeaker> = {},
) {
  return {
    id,
    name,
    speakerCongregationId,
    legacyCongregationName: null,
    phone: null,
    phone2: null,
    email: null,
    email2: null,
    notes: null,
    talks: [],
    retiredAt: null,
    lastVisit: null,
    nextVisit: null,
    visitCount: 0,
    ...extra,
  } satisfies DirectorySpeaker
}

const directory: SpeakerDirectory = {
  congregations: [
    congregation(8, 'Bagnolet', new Date('2026-09-12')),
    congregation(9, 'Pantin', new Date('2025-01-03')),
    congregation(10, 'Romainville'),
  ],
  speakers: [
    speaker(1, 'Hugo BLANC', 8, { lastVisit: new Date('2025-06-22'), phone: '06 98 11 23 40' }),
    speaker(2, 'Paul LEROY', 8, { talks: [12, 54], lastVisit: new Date('2026-03-08'), email: 'p@exemple.fr' }),
    speaker(3, 'Kevin ROCHE', 9, {
      phone: '07 12 90 44 61',
      nextVisit: { date: new Date('2026-11-29'), eventId: 4, status: 'released' },
    }),
    speaker(4, 'Thierry MASSON', 8, { retiredAt: new Date('2026-09-12') }),
    speaker(5, 'M. DIALLO', null),
  ],
}

describe('buildSpeakerGroups', () => {
  it('groups the speakers on a list by congregation, the ones without last, an empty congregation included', () => {
    const groups = buildSpeakerGroups(directory, { view: 'list', query: '', sort: 'name', filters: {} })
    expect(groups.map(g => [g.congregation?.name ?? null, g.speakers.map(s => s.name)])).toEqual([
      ['Bagnolet', ['Hugo BLANC', 'Paul LEROY']],
      ['Pantin', ['Kevin ROCHE']],
      ['Romainville', []],
      [null, ['M. DIALLO']],
    ])
  })

  it('hides the empty congregations while searching', () => {
    const groups = buildSpeakerGroups(directory, { view: 'list', query: 'kevin', sort: 'name', filters: {} })
    expect(groups.map(g => g.congregation?.name)).toEqual(['Pantin'])
  })

  it('shows only the retired ones in the « Retirés » view', () => {
    const groups = buildSpeakerGroups(directory, { view: 'retired', query: '', sort: 'name', filters: {} })
    expect(groups.map(g => g.speakers.map(s => s.name))).toEqual([['Thierry MASSON']])
  })

  it('finds a speaker by name without accents or case, by congregation, or by talk number', () => {
    const names = (query: string) =>
      buildSpeakerGroups(directory, { view: 'list', query, sort: 'name', filters: {} }).flatMap(g =>
        g.speakers.map(s => s.name),
      )
    expect(names('leroy')).toEqual(['Paul LEROY'])
    expect(names('pantin')).toEqual(['Kevin ROCHE'])
    expect(names('54')).toEqual(['Paul LEROY'])
  })

  it('sorts by last visit, never-came first, or by next visit, unplanned last', () => {
    const byLast = buildSpeakerGroups(directory, { view: 'list', query: '', sort: 'last-visit', filters: {} })
    expect(byLast[0]?.speakers.map(s => s.name)).toEqual(['Hugo BLANC', 'Paul LEROY'])
    const all = { ...directory, speakers: directory.speakers.map(s => ({ ...s, speakerCongregationId: 8 })) }
    const byNext = buildSpeakerGroups(all, { view: 'list', query: '', sort: 'next-visit', filters: {} })
    expect(byNext[0]?.speakers[0]?.name).toBe('Kevin ROCHE')
  })
})

describe('filters', () => {
  const NOW = new Date('2026-11-11T12:00:00Z')
  const names = (filters: Parameters<typeof buildSpeakerGroups>[1]['filters']) =>
    buildSpeakerGroups(directory, { view: 'list', query: '', sort: 'name', filters }, NOW).flatMap(g =>
      g.speakers.map(s => s.name),
    )

  it('keeps the records to complete: no congregation or nobody to reach', () => {
    expect(names({ record: 'incomplete' })).toEqual(['M. DIALLO'])
  })

  it('keeps the speakers whose congregation’s list is over a year old', () => {
    expect(names({ list: 'stale' })).toEqual(['Kevin ROCHE'])
  })

  it('keeps the speakers who never came, or the ones planned within a month', () => {
    expect(names({ visits: 'never' })).toEqual(['Kevin ROCHE', 'M. DIALLO'])
    expect(names({ visits: 'soon' })).toEqual(['Kevin ROCHE'])
  })

  it('combines the filters, and hides the empty congregations while any is on', () => {
    expect(names({ list: 'stale', visits: 'soon' })).toEqual(['Kevin ROCHE'])
    const groups = buildSpeakerGroups(
      directory,
      { view: 'list', query: '', sort: 'name', filters: { visits: 'soon' } },
      NOW,
    )
    expect(groups.map(g => g.congregation?.name)).toEqual(['Pantin'])
  })
})

describe('isIncomplete / isResponsible', () => {
  it('reads a record without congregation or contact as to complete', () => {
    expect(isIncomplete(directory.speakers[4] as DirectorySpeaker)).toBe(true)
    expect(isIncomplete(directory.speakers[0] as DirectorySpeaker)).toBe(false)
  })

  it('recognises the public talk coordinator however his name is spelled', () => {
    const bagnolet = { ...congregation(8, 'Bagnolet'), responsibleName: 'paul leroy' }
    expect(isResponsible(directory.speakers[1] as DirectorySpeaker, bagnolet)).toBe(true)
    expect(isResponsible(directory.speakers[0] as DirectorySpeaker, bagnolet)).toBe(false)
  })
})

describe('speakerCounts', () => {
  it('counts the speakers on a list, the retired ones, and the congregations', () => {
    expect(speakerCounts(directory)).toEqual({ onList: 4, retired: 1, congregations: 3 })
  })
})

describe('isListStale', () => {
  it('flags a list over a year old', () => {
    const now = new Date('2026-11-11')
    expect(isListStale(new Date('2025-01-03'), now)).toBe(true)
    expect(isListStale(new Date('2026-09-12'), now)).toBe(false)
    expect(isListStale(null, now)).toBe(false)
  })
})
