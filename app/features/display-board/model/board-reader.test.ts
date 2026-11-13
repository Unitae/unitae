import { describe, expect, it } from 'vitest'
import { boardSearchQuery, countDocumentMatches, isReader, partNames, personMatches, textMatches } from './board-reader'

const person = (firstname: string, lastname: string, id = 0) => ({ id, firstname, lastname, anonymizedAt: null })

describe('boardSearchQuery', () => {
  it('compares without accents or case', () => {
    expect(boardSearchQuery('  Léa ')).toBe('lea')
  })

  it('waits for two letters, since one matches nearly every name', () => {
    expect(boardSearchQuery('é')).toBeNull()
    expect(boardSearchQuery('   ')).toBeNull()
  })
})

describe('personMatches', () => {
  it('finds a name by its first or last name, whatever the accents', () => {
    expect(personMatches(person('Léa', 'Garnier'), 'garn')).toBe(true)
    expect(personMatches(person('Hélène', 'Clément'), 'helene cl')).toBe(true)
  })

  it('never matches without a query, nor an anonymized person', () => {
    expect(personMatches(person('Léa', 'Garnier'), null)).toBe(false)
    expect(personMatches({ firstname: 'Léa', lastname: 'Garnier', anonymizedAt: new Date() }, 'lea')).toBe(false)
  })
})

describe('textMatches', () => {
  it('finds a written name whatever the accents or case, and nothing without a query', () => {
    expect(textMatches('Hélène Clément', 'helene')).toBe(true)
    expect(textMatches('Hélène Clément', 'paul')).toBe(false)
    expect(textMatches('Hélène Clément', null)).toBe(false)
  })
})

describe('partNames', () => {
  const speaker = (name: string, anonymizedAt: Date | null = null) => ({ name, anonymizedAt })

  it('names a visiting speaker by their name, as the part shows it', () => {
    expect(partNames({ assignee: null, assistant: null, externalSpeaker: speaker('Paul Martin') })).toEqual([
      'Paul Martin',
    ])
  })

  it('names nobody for a deleted speaker: their name is no longer on the board', () => {
    expect(partNames({ assignee: null, assistant: null, externalSpeaker: speaker('', new Date()) })).toEqual([])
  })

  it('names the assignee, then the assistant beside them', () => {
    const part = { assignee: person('Marc', 'Dupont', 1), assistant: person('Léa', 'Garnier', 2) }
    expect(partNames(part)).toEqual(['Marc DUPONT', 'Léa GARNIER'])
  })

  it('leaves out an assistant with no assignee, whom neither the screen nor the sheet shows', () => {
    expect(partNames({ assignee: null, assistant: person('Léa', 'Garnier', 2) })).toEqual([])
  })
})

describe('isReader', () => {
  const reader = { memberId: 7, canViewPublishers: false, canViewRoles: false, canViewPrograms: false }

  it('recognises the reader by their member', () => {
    expect(isReader(7, reader)).toBe(true)
    expect(isReader(8, reader)).toBe(false)
  })

  it('marks nobody for an account without a member', () => {
    expect(isReader(null, { ...reader, memberId: null })).toBe(false)
  })
})

describe('countDocumentMatches', () => {
  it('counts the names a search lights up in the groups, each leader once though they belong to their group', () => {
    const responsible = person('Marc', 'Dupont', 1)
    const deputy = person('Julien', 'Dupont', 2)
    const groups = [{ responsible, deputy, members: [responsible, deputy, person('Marie', 'Dupont', 3)] }]
    expect(countDocumentMatches({ type: 'publisher-groups', groups }, 'dupont')).toBe(3)
  })

  it('counts on the organigram only the people it prints: rosters whole, then who each row names', () => {
    let nextId = 1
    const holder = (firstname: string, lastname: string, kind: string) => ({
      roleId: 0,
      memberId: nextId++,
      firstname,
      lastname,
      anonymizedAt: null,
      kind,
      isElder: true,
    })
    const node = (name: string, holders: ReturnType<typeof holder>[], children: unknown[] = [], isRoster = false) => ({
      id: nextId++,
      key: name,
      name,
      note: null,
      isRoster,
      isSinglePerson: false,
      holders,
      children: children as never[],
    })
    const tree = [
      node('Anciens', [holder('Marc', 'Dupont', 'member')], [], true),
      // The service's row names its leader and, as adjoints, the leaders of its teams; a team's own
      // adjoint and its members never print, so a search must not count them.
      node(
        'Accueil',
        [holder('Paul', 'Dupont', 'leader')],
        [
          node('Porte', [
            holder('Rose', 'Dupont', 'leader'),
            holder('Anne', 'Dupont', 'deputy'),
            holder('Luc', 'Dupont', 'member'),
          ]),
        ],
      ),
    ]
    expect(countDocumentMatches({ type: 'organigram', tree }, 'dupont')).toBe(3)
  })

  it('counts the programme parts and services each template shows', () => {
    const events = [
      {
        templateId: 1,
        eventParts: [{ assignee: person('Marc', 'Dupont', 1), assistant: person('Léa', 'Dupont', 2) }],
        eventServiceParts: [{ name: 'Sono', assignee: person('Paul', 'Dupont', 3) }],
      },
      {
        templateId: 2,
        eventParts: [{ assignee: person('Rose', 'Dupont', 4), assistant: null }],
        eventServiceParts: [],
      },
    ]
    const config = {
      templates: [
        { templateId: 1, parts: true, services: false },
        { templateId: 2, parts: false, services: true },
      ],
    }
    expect(countDocumentMatches({ type: 'programme', events, config, showServices: true }, 'dupont')).toBe(2)
  })

  it('counts the names a programme part shows: its visiting speaker, never an assistant left without an assignee', () => {
    const programme = (part: Parameters<typeof partNames>[0]) => ({
      type: 'programme' as const,
      events: [{ templateId: null, eventParts: [part] }],
      config: null,
      showServices: false,
    })
    const speaker = { assignee: null, assistant: null, externalSpeaker: { name: 'Paul Dupont', anonymizedAt: null } }
    expect(countDocumentMatches(programme(speaker), 'dupont')).toBe(1)
    expect(countDocumentMatches(programme({ assignee: null, assistant: person('Léa', 'Dupont', 2) }), 'dupont')).toBe(0)
  })

  it('counts nothing without a query', () => {
    expect(countDocumentMatches({ type: 'pioneers', pioneers: [person('Marc', 'Dupont')] }, null)).toBe(0)
  })
})
