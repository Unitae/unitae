import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'

const { tree, proposal, offChart } = vi.hoisted(() => ({
  tree: { value: [] as OrganigramNode[] },
  proposal: { value: { alreadyAdopted: true, posts: [], candidates: [] } as unknown },
  offChart: { value: new Map<number, OrganigramNode>() },
}))
vi.mock('~/shared/domain/organigram.queries', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/organigram.queries')>()),
  getOrganigram: vi.fn(async () => tree.value),
  getOffChartRole: vi.fn(async (_db: unknown, roleId: number) => offChart.value.get(roleId) ?? null),
}))
vi.mock('~/shared/domain/organigram-adoption.server', () => ({
  proposeCommitteeAdoption: vi.fn(async () => proposal.value),
}))

const { loadOrganigramPage } = await import('./organigram-page.queries')

const holder = (memberId: number, firstname: string, kind: string) => ({
  roleId: 1,
  memberId,
  firstname,
  lastname: 'Martin',
  anonymizedAt: null,
  kind,
  isElder: false,
})
const node = (id: number, name: string, over: Partial<OrganigramNode> = {}): OrganigramNode => ({
  id,
  key: `role-${id}`,
  name,
  note: null,
  isRoster: false,
  isSinglePerson: false,
  holders: [],
  children: [],
  ...over,
})

function makeDb(offChart: { id: number; key: string; name: string | null }[] = []) {
  return {
    role: {
      findFirst: vi.fn(async () => ({ description: 'Prépare les territoires.', isBuiltIn: false })),
      findMany: vi.fn(async () => offChart.map(role => ({ ...role, _count: { members: 1, memberAssignments: 2 } }))),
    },
    member: {
      findMany: vi.fn(async () => [
        { id: 500, firstname: 'Anna', lastname: 'Martin', isHelder: true },
        { id: 501, firstname: 'Bruno', lastname: 'Martin', isHelder: false },
      ]),
    },
    boardDynamicDocumentSettings: { findFirst: vi.fn(async () => ({ id: 383 })) },
    rolePermission: { groupBy: vi.fn(async () => [{ roleId: 21, _count: { permissionId: 2 } }]) },
  }
}

beforeEach(() => {
  offChart.value = new Map()
  tree.value = [node(1, 'Territoires', { holders: [holder(500, 'Anna', 'leader')] })]
  proposal.value = { alreadyAdopted: true, posts: [], candidates: [] }
})

describe('loadOrganigramPage', () => {
  it('gives a reader the chart, the chosen role’s panel and the board document, nothing to arrange', async () => {
    const page = await loadOrganigramPage(makeDb() as never, 10, { canManage: false, selectedId: 1 })
    expect(page.panel?.name).toBe('Territoires')
    expect(page.panel?.description).toBe('Prépare les territoires.')
    expect(page.boardDocumentId).toBe(383)
    expect(page.manage).toBeNull()
  })

  it('opens the panel of a role outside the chart, with the chart roles to attach it under', async () => {
    offChart.value.set(99, node(99, 'Lecteurs', { holders: [holder(501, 'Bruno', 'member')] }))
    const page = await loadOrganigramPage(makeDb() as never, 10, { canManage: false, selectedId: 99 })
    expect(page.panel).toMatchObject({ id: 99, offChart: true, members: ['Bruno MARTIN'] })
    expect(page.panel?.moveTargets).toEqual([{ id: 1, label: 'Territoires' }])
  })

  it('opens no panel for a role that does not exist', async () => {
    const page = await loadOrganigramPage(makeDb() as never, 10, { canManage: false, selectedId: 98 })
    expect(page.panel).toBeNull()
  })

  it('offers anyone in the congregation to be named, and says who is not an elder', async () => {
    const page = await loadOrganigramPage(makeDb() as never, 10, { canManage: true, selectedId: null })
    expect(page.manage?.people.map(person => person.id)).toEqual([500, 501])
    expect(page.manage?.nonElderIds).toEqual([501])
  })

  it('offers off-chart teams to attach with their holders, never the lists or the posts', async () => {
    const db = makeDb([
      { id: 30, key: 'cartes', name: 'Cartes' },
      { id: 31, key: 'elder', name: null },
      { id: 32, key: 'coordinator', name: null },
    ])
    const page = await loadOrganigramPage(db as never, 10, { canManage: true, selectedId: null })
    expect(page.manage?.offChart).toEqual([{ id: 30, name: 'Cartes', holderCount: 3 }])
    expect(page.manage?.rosters.map(role => role.id)).toEqual([31])
    expect(page.manage?.committee).toBeNull()
  })

  it('offers the committee takeover with what each candidate brings', async () => {
    tree.value = [
      node(21, 'Coordinateur', {
        holders: [holder(500, 'Anna', 'leader')],
        children: [node(23, 'Accueil')],
      }),
    ]
    proposal.value = {
      alreadyAdopted: false,
      posts: [{ key: 'coordinator', name: 'Coordinateur du collège des anciens', suggestedRoleId: 21 }],
      candidates: [{ id: 21, name: 'Coordinateur' }],
    }
    const db = makeDb([{ id: 2, key: 'service-committee', name: null }])
    const page = await loadOrganigramPage(db as never, 10, { canManage: true, selectedId: null })
    expect(page.manage?.committee?.candidates).toEqual([
      { id: 21, name: 'Coordinateur', leader: 'Anna MARTIN', children: ['Accueil'], permissionCount: 2 },
    ])
  })
})
