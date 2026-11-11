import { describe, expect, it, vi } from 'vitest'

// The Équipes page: everyone by default, a view narrows to brothers, sisters, elders…, each view says how many it
// holds, and a person's seats come from their record, or from a login without one.

const { loadTeamsPage } = await import('./teams-page.queries')

const role = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id,
  key: `role-${id}`,
  name,
  isBuiltIn: false,
  isSinglePerson: false,
  showInOrganigram: false,
  parentRoleId: null,
  organigramOrder: null,
  ...over,
})

const person = (id: number, firstname: string, lastname: string, over: Record<string, unknown> = {}) => ({
  id,
  firstname,
  lastname,
  isPublisher: true,
  isMale: true,
  baptismDate: null,
  isAnointed: false,
  isHelder: false,
  isServant: false,
  roleAssignments: [] as { roleId: number; kind: string }[],
  account: null as null | { roleAssignments: { roleId: number; kind: string }[] },
  ...over,
})

function makeDb() {
  return {
    role: { findMany: vi.fn(async () => [role(7, 'Sono'), role(8, 'Nettoyage')]) },
    memberRoleAssignment: {
      groupBy: vi.fn(async () => [
        { roleId: 7, kind: 'member', _count: { roleId: 2 } },
        { roleId: 7, kind: 'leader', _count: { roleId: 1 } },
      ]),
    },
    userRoleAssignment: { groupBy: vi.fn(async () => [{ roleId: 8, kind: 'member', _count: { roleId: 1 } }]) },
    member: {
      findMany: vi.fn(async () => [
        person(1, 'Élodie', 'André', { isMale: false, roleAssignments: [{ roleId: 8, kind: 'member' }] }),
        person(2, 'Marc', 'Dupont', { isHelder: true, roleAssignments: [{ roleId: 7, kind: 'leader' }] }),
        person(3, 'Paul', 'Bernard', {
          isServant: true,
          baptismDate: new Date('2001-04-01'),
          account: { roleAssignments: [{ roleId: 7, kind: 'member' }] },
        }),
        person(4, 'Zoé', 'Roux', { isPublisher: false, isMale: false }),
      ]),
    },
  }
}

const load = (options: Partial<Parameters<typeof loadTeamsPage>[2]> = {}) =>
  loadTeamsPage(makeDb() as never, 10, { search: '', view: 'all', collapsed: new Set(), ...options })

describe('loadTeamsPage', () => {
  it('shows everyone by default, and how many each view holds', async () => {
    const page = await load()
    expect(page.members.map(member => member.id)).toEqual([1, 2, 3, 4])
    // A targeted view counts publishers only, as the role sync does; « Tous » counts everyone.
    expect(page.views).toEqual({
      all: 4,
      male: 2,
      female: 1,
      elder: 1,
      'assistant-servant': 1,
      publisher: 3,
      baptized: 1,
      anointed: 0,
    })
  })

  it('narrows to a view', async () => {
    const page = await load({ view: 'female' })
    expect(page.members.map(member => member.id)).toEqual([1])
  })

  it('finds a person by name, ignoring case and accents', async () => {
    const page = await load({ search: 'elodie' })
    expect(page.members.map(member => member.id)).toEqual([1])
    const both = await load({ search: 'paul ber' })
    expect(both.members.map(member => member.id)).toEqual([3])
  })

  it('reads a seat on the record, or on a login without one', async () => {
    const page = await load()
    const seatsOf = (id: number) => page.members.find(member => member.id === id)?.seats
    expect(seatsOf(2)).toEqual({ 7: 'leader' })
    expect(seatsOf(3)).toEqual({ 7: 'member' })
  })

  it('counts every holder of a team, whatever the view', async () => {
    const page = await load({ view: 'female' })
    expect(page.counts).toEqual({ 7: 3, 8: 1 })
    expect(page.groups.flatMap(group => group.columns.map(column => column.name))).toEqual(['Nettoyage', 'Sono'])
  })
})
