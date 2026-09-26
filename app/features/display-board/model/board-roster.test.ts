import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/messages', () => ({
  board_read_status_anonymized_user: () => 'Anonyme',
  board_dynamic_pioneers_type_permanent: () => 'Permanents',
  board_dynamic_pioneers_type_special: () => 'Spéciaux',
  board_dynamic_pioneers_type_missionary: () => 'Missionnaires',
  board_dynamic_pioneers_type_auxiliary: () => 'Auxiliaires',
}))

const { buildGroupRoster, formatBoardPersonName, groupPioneersByType, pioneerTypeLabel } = await import(
  './board-roster'
)

function person(id: number, firstname: string | null, lastname: string | null, anonymizedAt: Date | null = null) {
  return { id, firstname, lastname, anonymizedAt }
}

describe('formatBoardPersonName', () => {
  it('uppercases the last name and keeps the first name as written', () => {
    expect(formatBoardPersonName(person(1, 'Jean', 'Dupont'))).toEqual({
      kind: 'named',
      firstname: 'Jean',
      lastname: 'DUPONT',
      plain: 'Jean DUPONT',
    })
  })

  it('shows the anonymized label instead of the stored placeholder name', () => {
    expect(formatBoardPersonName(person(1, 'Utilisateur', 'supprime', new Date()))).toEqual({
      kind: 'anonymized',
      plain: 'Anonyme',
    })
  })

  it('falls back to a dash when there is no name at all', () => {
    expect(formatBoardPersonName(person(1, null, null))).toEqual({ kind: 'empty', plain: '—' })
  })

  it('keeps a lone first or last name', () => {
    expect(formatBoardPersonName(person(1, null, 'Dupont')).plain).toBe('DUPONT')
    expect(formatBoardPersonName(person(1, 'Jean', null)).plain).toBe('Jean')
  })
})

describe('buildGroupRoster', () => {
  it('lists responsible, deputy and members once each, sorted by last then first name', () => {
    const responsible = person(1, 'Marc', 'Dupont')
    const deputy = person(2, 'Anne', 'Bernard')
    const roster = buildGroupRoster({
      responsible,
      deputy,
      members: [person(3, 'Zoé', 'Martin'), responsible, person(4, 'Luc', 'bernard')],
    })

    expect(roster.map(p => p.id)).toEqual([2, 4, 1, 3])
  })

  it('works without a deputy', () => {
    const roster = buildGroupRoster({ responsible: person(1, 'Marc', 'Dupont'), deputy: null, members: [] })

    expect(roster.map(p => p.id)).toEqual([1])
  })
})

describe('groupPioneersByType', () => {
  it('groups by type and keeps the order the query ranked them in', () => {
    const pioneers = [
      { ...person(1, 'A', 'A'), type: 'PionnierPermanant' },
      { ...person(2, 'B', 'B'), type: 'PionnierPermanant' },
      { ...person(3, 'C', 'C'), type: 'PionnierAuxiliaires' },
    ]

    const groups = groupPioneersByType(pioneers)

    expect(groups.map(g => [g.type, g.pioneers.map(p => p.id)])).toEqual([
      ['PionnierPermanant', [1, 2]],
      ['PionnierAuxiliaires', [3]],
    ])
  })

  it('returns nothing for no pioneers', () => {
    expect(groupPioneersByType([])).toEqual([])
  })
})

describe('pioneerTypeLabel', () => {
  it('names every pioneer type', () => {
    expect(pioneerTypeLabel('PionnierPermanant')).toBe('Permanents')
    expect(pioneerTypeLabel('PionnierSpecial')).toBe('Spéciaux')
    expect(pioneerTypeLabel('Missionnaire')).toBe('Missionnaires')
    expect(pioneerTypeLabel('PionnierAuxiliaires')).toBe('Auxiliaires')
  })

  it('shows an unknown type as is rather than hiding it', () => {
    expect(pioneerTypeLabel('Autre')).toBe('Autre')
  })
})
