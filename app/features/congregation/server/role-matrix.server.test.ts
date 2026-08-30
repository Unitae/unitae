import { describe, expect, it } from 'vitest'
import { buildMatrixGroups, type MatrixRoleRow } from './role-matrix.server'

// The matrix's columns, banded by who answers for them: each committee post heads the services
// in its branch, everything chart-bound but unbranched lands in « others », and roles outside
// the chart close the table.
//
// Only the chart's LEAVES become columns: the matrix edits plain members, members live on the
// teams, and upper levels carry responsables/adjoints — the organigram's business. Personal
// roles are out for the same reason. The one exception is a role that still holds plain members
// from before this model: its column stays until emptied, so no membership ever becomes
// invisible, then disappears on its own.

let nextId = 100
function role(over: Partial<MatrixRoleRow> & { key: string }): MatrixRoleRow {
  return {
    id: nextId++,
    name: null,
    isBuiltIn: false,
    isSinglePerson: false,
    showInOrganigram: true,
    parentRoleId: null,
    organigramOrder: null,
    ...over,
  }
}

// The standard chart: elders → committee → three posts, with services below the posts.
const elder = role({ id: 1, key: 'elder', isBuiltIn: true })
const committee = role({ id: 2, key: 'service-committee', isBuiltIn: true, parentRoleId: 1 })
const coordinator = role({ id: 3, key: 'coordinator', isBuiltIn: true, isSinglePerson: true, parentRoleId: 2 })
const secretary = role({ id: 4, key: 'secretary', isBuiltIn: true, isSinglePerson: true, parentRoleId: 2 })
const overseer = role({ id: 5, key: 'service-overseer', isBuiltIn: true, isSinglePerson: true, parentRoleId: 2 })

describe('buildMatrixGroups', () => {
  it('bands each leaf under the committee post it reports to', () => {
    const accueil = role({ id: 10, key: 'accueil', name: 'Service Accueil', parentRoleId: 3, organigramOrder: 5 })
    const comptes = role({ id: 11, key: 'comptes', name: 'Comptes', parentRoleId: 4, organigramOrder: 5 })
    const territoires = role({ id: 12, key: 'territoires', name: 'Territoires', parentRoleId: 5, organigramOrder: 5 })

    const groups = buildMatrixGroups(
      [elder, committee, coordinator, secretary, overseer, accueil, comptes, territoires],
      new Set(),
      new Set(),
    )

    expect(groups.map(group => group.key)).toEqual(['coordinator', 'secretary', 'service-overseer'])
    expect(groups[0]?.columns.map(column => column.id)).toEqual([10])
    expect(groups[1]?.columns.map(column => column.id)).toEqual([11])
    expect(groups[2]?.columns.map(column => column.id)).toEqual([12])
  })

  it('shows only the lowest level: a service with teams yields its teams, not itself', () => {
    // Members live on the teams; upper levels carry responsables and adjoints, which are the
    // organigram's to change. A column of nothing but read-only seats earns no width.
    const audio = role({ id: 10, key: 'audio', name: 'Audio/Vidéo', parentRoleId: 3, organigramOrder: 10 })
    const estrade = role({ id: 11, key: 'estrade', name: 'Équipe Estrade', parentRoleId: 10, organigramOrder: 5 })
    const sono = role({ id: 12, key: 'sono', name: 'Équipe Sono', parentRoleId: 10, organigramOrder: 10 })
    const accueil = role({ id: 13, key: 'accueil', name: 'Accueil', parentRoleId: 3, organigramOrder: 5 })

    const groups = buildMatrixGroups(
      [elder, committee, coordinator, audio, estrade, sono, accueil],
      new Set(),
      new Set(),
    )

    // Accueil (leaf, order 5), then Audio's two teams in tree order — but not Audio itself.
    expect(groups[0]?.columns.map(column => column.id)).toEqual([13, 11, 12])
  })

  it('keeps a hidden level visible while it still holds plain members, then lets it vanish', () => {
    // Legacy shape from before the model: a parent service with direct members. Hiding its
    // column would make those memberships invisible and unremovable — so it stays until
    // emptied, and disappears on its own afterwards.
    const audio = role({ id: 10, key: 'audio', name: 'Audio/Vidéo', parentRoleId: 3, organigramOrder: 10 })
    const estrade = role({ id: 11, key: 'estrade', name: 'Équipe Estrade', parentRoleId: 10 })

    const withLegacy = buildMatrixGroups([elder, committee, coordinator, audio, estrade], new Set(), new Set([10]))
    expect(withLegacy[0]?.columns.map(column => column.id)).toEqual([10, 11])

    const emptied = buildMatrixGroups([elder, committee, coordinator, audio, estrade], new Set(), new Set())
    expect(emptied[0]?.columns.map(column => column.id)).toEqual([11])
  })

  it('leaves personal roles out — no plain members can ever sit on one', () => {
    const responsable = role({
      id: 10,
      key: 'responsable-nettoyage',
      name: 'Responsable Nettoyage',
      parentRoleId: 3,
      isSinglePerson: true,
    })

    const groups = buildMatrixGroups([elder, committee, coordinator, responsable], new Set(), new Set())
    expect(groups).toEqual([])

    // Except with pre-model member rows still on it: visible until cleaned up, like any legacy.
    const withLegacy = buildMatrixGroups([elder, committee, coordinator, responsable], new Set(), new Set([10]))
    expect(withLegacy[0]?.columns.map(column => column.id)).toEqual([10])
    expect(withLegacy[0]?.columns[0]?.isSinglePerson).toBe(true)
  })

  it('collects leaf roles outside every post branch into others, and off-chart roles last', () => {
    const covoiturage = role({ id: 10, key: 'covoiturage', name: 'Covoiturage', parentRoleId: 1, organigramOrder: 50 })
    const pionniers = role({ id: 11, key: 'pionniers', name: 'Pionniers', showInOrganigram: false })

    const groups = buildMatrixGroups([elder, committee, coordinator, covoiturage, pionniers], new Set(), new Set())

    expect(groups.map(group => group.key)).toEqual(['others', 'off-chart'])
    expect(groups[0]?.columns.map(column => column.id)).toEqual([10])
    expect(groups[1]?.columns.map(column => column.id)).toEqual([11])
  })

  it('never emits an empty band, and never emits built-ins as columns', () => {
    const groups = buildMatrixGroups([elder, committee, coordinator, secretary, overseer], new Set(), new Set())

    expect(groups).toEqual([])
  })

  it('marks the bands the reader chose to fold', () => {
    const accueil = role({ id: 10, key: 'accueil', name: 'Accueil', parentRoleId: 3 })
    const pionniers = role({ id: 11, key: 'pionniers', name: 'Pionniers', showInOrganigram: false })

    const groups = buildMatrixGroups(
      [elder, committee, coordinator, accueil, pionniers],
      new Set(['coordinator']),
      new Set(),
    )

    expect(groups.find(group => group.key === 'coordinator')?.collapsed).toBe(true)
    expect(groups.find(group => group.key === 'off-chart')?.collapsed).toBe(false)
  })

  it('does not hang on a cycle in hand-edited data', () => {
    // Two rows parenting each other are both "non-leaf"; with members on them they must both
    // surface rather than spin the request.
    const a = role({ id: 10, key: 'a', name: 'A', parentRoleId: 11 })
    const b = role({ id: 11, key: 'b', name: 'B', parentRoleId: 10 })

    const groups = buildMatrixGroups([a, b], new Set(), new Set([10, 11]))

    expect(groups.flatMap(group => group.columns.map(column => column.id)).sort()).toEqual([10, 11])
  })
})
