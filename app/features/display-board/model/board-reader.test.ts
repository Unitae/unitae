import { describe, expect, it } from 'vitest'
import { boardSearchQuery, countDocumentMatches, isReader, personMatches } from './board-reader'

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
  it('counts the names a search lights up in the groups, leaders included', () => {
    const groups = [
      {
        responsible: person('Marc', 'Dupont'),
        deputy: person('Julien', 'Girard'),
        members: [person('Marie', 'Dupont')],
      },
    ]
    expect(countDocumentMatches({ type: 'publisher-groups', groups }, 'dupont')).toBe(2)
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
        eventParts: [{ assignee: person('Marc', 'Dupont'), assistant: person('Léa', 'Dupont') }],
        eventServiceParts: [{ name: 'Sono', assignee: person('Paul', 'Dupont') }],
      },
      { templateId: 2, eventParts: [{ assignee: person('Rose', 'Dupont'), assistant: null }], eventServiceParts: [] },
    ]
    const config = {
      templates: [
        { templateId: 1, parts: true, services: false },
        { templateId: 2, parts: false, services: true },
      ],
    }
    expect(countDocumentMatches({ type: 'programme', events, config, showServices: true }, 'dupont')).toBe(2)
  })

  it('counts nothing without a query', () => {
    expect(countDocumentMatches({ type: 'pioneers', pioneers: [person('Marc', 'Dupont')] }, null)).toBe(0)
  })
})
