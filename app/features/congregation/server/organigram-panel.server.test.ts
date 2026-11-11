import { describe, expect, it } from 'vitest'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import type { FlatEntry } from '~/shared/domain/organigram-layout'
import { buildMoveTargets, buildOffChartPanel, buildRolePanel, buildRolePickers } from './organigram-panel.server'

// Pure assembly for the organigram page: flat entries in, panel shape and legal move targets
// out. Extracted from the route loader so the flag wiring is testable without a request.

let nextId = 1
function node(over: Partial<OrganigramNode> = {}): OrganigramNode {
  return {
    id: nextId++,
    key: `service-${nextId}`,
    name: `Service ${nextId}`,
    note: null,
    isRoster: false,
    isSinglePerson: false,
    holders: [],
    children: [],
    ...over,
  }
}

function entry(over: Partial<FlatEntry> & { node: OrganigramNode }): FlatEntry {
  return { id: over.node.id, label: over.node.name, parentId: null, parentName: null, ...over }
}

const holder = (memberId: number, firstname: string, kind: string, isElder = false) => ({
  roleId: 1,
  memberId,
  firstname,
  lastname: 'Dupont',
  anonymizedAt: null,
  kind,
  isElder,
})
const CUSTOM = { description: 'Prépare les territoires.', isBuiltIn: false }
const BUILT_IN = { description: null, isBuiltIn: true }

describe('buildRolePanel', () => {
  it('tells a committee post, the committee, a list, a personal role and a team apart', () => {
    const kinds = [
      buildRolePanel([entry({ node: node({ key: 'coordinator', isSinglePerson: true }) })], 0, BUILT_IN).kind,
      buildRolePanel([entry({ node: node({ key: 'service-committee' }) })], 0, BUILT_IN).kind,
      buildRolePanel([entry({ node: node({ key: 'elder', isRoster: true }) })], 0, BUILT_IN).kind,
      buildRolePanel([entry({ node: node({ isSinglePerson: true }) })], 0, CUSTOM).kind,
      buildRolePanel([entry({ node: node({}) })], 0, CUSTOM).kind,
    ]
    expect(kinds).toEqual(['post', 'committee', 'roster', 'personal', 'team'])
  })

  it('splits a team’s seats from its plain members, names in capitals', () => {
    const team = node({
      holders: [holder(9, 'Marc', 'leader', true), holder(10, 'Hugo', 'deputy'), holder(11, 'Luc', 'member')],
    })
    const panel = buildRolePanel([entry({ node: team })], 0, CUSTOM)
    expect(panel.seats).toEqual([
      { memberId: 9, name: 'Marc DUPONT', seat: 'leader', isElder: true },
      { memberId: 10, name: 'Hugo DUPONT', seat: 'deputy', isElder: false },
    ])
    expect(panel.members).toEqual(['Luc DUPONT'])
  })

  it('lists a roster’s people as its members, every one of them', () => {
    const roster = node({ key: 'elder', isRoster: true, holders: [holder(9, 'Marc', 'member', true)] })
    const panel = buildRolePanel([entry({ node: roster })], 0, BUILT_IN)
    expect(panel.seats.map(seat => seat.name)).toEqual(['Marc DUPONT'])
    expect(panel.members).toEqual([])
  })

  it('gives its parent, its children, and its place among its siblings', () => {
    const first = node({ name: 'Porte' })
    const second = node({ name: 'Auditorium' })
    const parent = node({ name: 'Accueil', children: [first, second] })
    const flat = [
      entry({ node: parent }),
      entry({ node: first, parentId: parent.id, parentName: 'Accueil' }),
      entry({ node: second, parentId: parent.id, parentName: 'Accueil' }),
    ]
    const panel = buildRolePanel(flat, 2, CUSTOM)
    expect(panel.parent).toEqual({ id: parent.id, name: 'Accueil' })
    expect(panel.position).toEqual({ index: 2, of: 2 })
    expect(buildRolePanel(flat, 0, CUSTOM).children.map(child => child.name)).toEqual(['Porte', 'Auditorium'])
  })

  it('lets the congregation’s own roles be edited, never a built-in one', () => {
    expect(buildRolePanel([entry({ node: node({}) })], 0, CUSTOM).editable).toBe(true)
    expect(buildRolePanel([entry({ node: node({ key: 'coordinator' }) })], 0, BUILT_IN).editable).toBe(false)
  })

  it('offers every role as a new place except itself and those under it', () => {
    const child = node({})
    const parent = node({ children: [child] })
    const other = node({})
    const flat = [
      entry({ node: parent }),
      entry({ node: child, parentId: parent.id, parentName: parent.name }),
      entry({ node: other }),
    ]
    expect(buildRolePanel(flat, 0, CUSTOM).moveTargets.map(target => target.id)).toEqual([other.id])
  })
})

describe('buildRolePickers', () => {
  it('splits off-chart roles into panel candidates and roster recovery', () => {
    const rows = [
      { id: 1, key: 'sono', name: 'Sono' },
      { id: 2, key: 'elder', name: null },
      { id: 3, key: 'coordinator', name: null },
      { id: 4, key: 'sister', name: null },
    ]

    const { adoptable, rosters } = buildRolePickers(rows)

    // Only the plain service may be attached under a node; the roster may only return to the
    // top; the appointed post and the identity population are offered nowhere.
    expect(adoptable.map(role => role.id)).toEqual([1])
    expect(rosters.map(role => role.id)).toEqual([2])
  })
})

describe('buildMoveTargets', () => {
  it('excludes the selected node and everything under it', () => {
    const child = node({})
    const parent = node({ children: [child] })
    const other = node({})
    const flat: FlatEntry[] = [
      entry({ node: parent }),
      entry({ node: child, parentId: parent.id, parentName: parent.name }),
      entry({ node: other }),
    ]

    const targets = buildMoveTargets(flat, flat[0])

    expect(targets.map(target => target.id)).toEqual([other.id])
  })

  it('offers every node when nothing is selected', () => {
    const a = node({})
    const b = node({})
    const flat = [entry({ node: a }), entry({ node: b })]

    expect(buildMoveTargets(flat, undefined)).toHaveLength(2)
  })
})

describe('buildOffChartPanel', () => {
  it('shows a role outside the chart with its people, and every chart role as a place to attach it', () => {
    const lecteurs = node({
      name: 'Lecteurs',
      holders: [holder(9, 'Marc', 'leader', true), holder(11, 'Luc', 'member')],
    })
    const places = [
      { id: 1, label: 'Anciens' },
      { id: 2, label: '\u00a0\u00a0Comité de service' },
    ]
    const panel = buildOffChartPanel(lecteurs, CUSTOM, places)
    expect(panel).toMatchObject({
      name: 'Lecteurs',
      kind: 'team',
      offChart: true,
      editable: true,
      parent: null,
      children: [],
      members: ['Luc DUPONT'],
      moveTargets: places,
    })
    expect(panel.seats).toEqual([{ memberId: 9, name: 'Marc DUPONT', seat: 'leader', isElder: true }])
  })

  it('marks a role of the chart as on it', () => {
    expect(buildRolePanel([entry({ node: node({}) })], 0, CUSTOM).offChart).toBe(false)
  })
})
