import { describe, expect, it } from 'vitest'
import {
  ancestorChainIds,
  buildOrganigramTree,
  descendantIds,
  type OrganigramHolder,
  type OrganigramRole,
  subtreeHeight,
} from '~/shared/domain/organigram.queries'

// Assembly is pure: the caller hands over flat rows and gets the tree. Keeping it separable
// from the queries is what lets the ordering and orphan rules be tested without a database.

let nextId = 1
function role(over: Partial<OrganigramRole> = {}): OrganigramRole {
  return {
    id: nextId++,
    key: `role-${nextId}`,
    name: `Role ${nextId}`,
    isBuiltIn: false,
    parentRoleId: null,
    organigramOrder: null,
    organigramNote: null,
    isSinglePerson: false,
    ...over,
  }
}

function holder(roleId: number, kind: OrganigramHolder['kind'], lastname: string): OrganigramHolder {
  return { roleId, memberId: nextId++, firstname: 'X', lastname, anonymizedAt: null, kind }
}

describe('buildOrganigramTree — shape', () => {
  it('nests children under their parent', () => {
    const root = role({ id: 1, name: 'Collège' })
    const child = role({ id: 2, name: 'Comité', parentRoleId: 1 })
    const grandchild = role({ id: 3, name: 'Secrétaire', parentRoleId: 2 })

    const tree = buildOrganigramTree([grandchild, child, root], [])

    expect(tree).toHaveLength(1)
    expect(tree[0]?.name).toBe('Collège')
    expect(tree[0]?.children[0]?.name).toBe('Comité')
    expect(tree[0]?.children[0]?.children[0]?.name).toBe('Secrétaire')
  })

  it('promotes an orphan to a root rather than dropping it', () => {
    // The parent was un-flagged from the organigram but the child was not. Losing a whole
    // branch silently is far worse than showing it detached.
    //
    // A real root sits alongside on purpose: without it, an implementation that returned an
    // empty tree and then recovered by some other route could still satisfy this.
    const realRoot = role({ id: 1, name: 'Collège', organigramOrder: 1 })
    const orphan = role({ id: 5, name: 'Comptes', parentRoleId: 999, organigramOrder: 2 })
    const orphanChild = role({ id: 6, name: 'Préposé', parentRoleId: 5 })

    const tree = buildOrganigramTree([orphanChild, orphan, realRoot], [])

    expect(tree.map(n => n.name)).toEqual(['Collège', 'Comptes'])
    // The orphan keeps its own subtree — only its link upward was lost.
    expect(tree[1]?.children.map(c => c.name)).toEqual(['Préposé'])
  })

  it('does not hang on a cycle in the data', () => {
    // The policy prevents cycles on write; this is the belt-and-braces case where bad rows
    // reach the reader anyway (a hand-edited database, a bad import).
    const a = role({ id: 1, name: 'A', parentRoleId: 2 })
    const b = role({ id: 2, name: 'B', parentRoleId: 1 })

    const tree = buildOrganigramTree([a, b], [])

    expect(tree.length).toBeGreaterThan(0)
  })
})

describe('buildOrganigramTree — ordering', () => {
  it('orders siblings by organigramOrder, then by name', () => {
    const root = role({ id: 1, name: 'Root' })
    const third = role({ id: 4, name: 'Zulu', parentRoleId: 1, organigramOrder: 20 })
    const first = role({ id: 2, name: 'Bravo', parentRoleId: 1, organigramOrder: 10 })
    const second = role({ id: 3, name: 'Alpha', parentRoleId: 1, organigramOrder: 20 })

    const tree = buildOrganigramTree([third, first, second, root], [])

    expect(tree[0]?.children.map(c => c.name)).toEqual(['Bravo', 'Alpha', 'Zulu'])
  })

  it('orders holders leader, then deputies, then members', () => {
    const node = role({ id: 1, name: 'Audio' })
    const holders = [holder(1, 'member', 'MEMBRE'), holder(1, 'deputy', 'ADJOINT'), holder(1, 'leader', 'RESPONSABLE')]

    const tree = buildOrganigramTree([node], holders)

    expect(tree[0]?.holders.map(h => h.lastname)).toEqual(['RESPONSABLE', 'ADJOINT', 'MEMBRE'])
  })

  it('orders holders of the same kind by name', () => {
    const node = role({ id: 1, name: 'Sono' })
    const holders = [holder(1, 'member', 'ZOLA'), holder(1, 'member', 'ABEL')]

    const tree = buildOrganigramTree([node], holders)

    expect(tree[0]?.holders.map(h => h.lastname)).toEqual(['ABEL', 'ZOLA'])
  })
})

describe('buildOrganigramTree — node content', () => {
  it('leaves a node with nobody in it empty, so the caller can mark it vacant', () => {
    const tree = buildOrganigramTree([role({ id: 1, name: 'Nettoyage' })], [])
    expect(tree[0]?.holders).toEqual([])
  })

  it('resolves a built-in roster’s name from the catalogue, not the database', () => {
    // Built-in roles keep `name` NULL so they stay localisable; getRoleDisplayName supplies it.
    const tree = buildOrganigramTree([role({ id: 1, key: 'elder', name: null, isBuiltIn: true })], [])

    expect(tree[0]?.name).not.toBe('')
    expect(tree[0]?.name).not.toBe('elder')
    expect(tree[0]?.isRoster).toBe(true)
  })

  it.each([
    'service-committee',
    'coordinator',
    'secretary',
    'service-overseer',
  ])('does not treat the built-in %s as an auto-synced roster', key => {
    // `isRoster` once read `isBuiltIn`, which was true of the rosters alone until the committee
    // posts arrived. Getting this wrong renders a post as a reconciled list whose membership
    // cannot be edited — the one thing those posts exist to let you do.
    const tree = buildOrganigramTree([role({ id: 1, key, name: null, isBuiltIn: true })], [])

    expect(tree[0]?.isRoster).toBe(false)
  })

  it('carries the personal-role flag onto the node', () => {
    const personal = role({ id: 1, isSinglePerson: true })
    const group = role({ id: 2 })

    const tree = buildOrganigramTree([personal, group], [])

    expect(tree.find(node => node.id === 1)?.isSinglePerson).toBe(true)
    expect(tree.find(node => node.id === 2)?.isSinglePerson).toBe(false)
  })

  it('carries the free-text note through', () => {
    const tree = buildOrganigramTree([role({ id: 1, organigramNote: 'Équipe des préposés' })], [])
    expect(tree[0]?.note).toBe('Équipe des préposés')
  })

  it('attaches holders to the right node', () => {
    const a = role({ id: 1, name: 'A' })
    const b = role({ id: 2, name: 'B' })
    const tree = buildOrganigramTree([a, b], [holder(2, 'leader', 'CHEZ-B')])

    expect(tree.find(n => n.name === 'A')?.holders).toEqual([])
    expect(tree.find(n => n.name === 'B')?.holders.map(h => h.lastname)).toEqual(['CHEZ-B'])
  })
})

describe('ancestorChainIds — what the policy needs to judge a move', () => {
  // parent -> grandparent -> root, nearest first. Feeding this to assertCanSetParent is what
  // keeps cycle detection a pure function.
  const flat = [
    { id: 1, parentRoleId: null },
    { id: 2, parentRoleId: 1 },
    { id: 3, parentRoleId: 2 },
  ]

  it('returns the node then its ancestors, nearest first', () => {
    expect(ancestorChainIds(flat, 3)).toEqual([3, 2, 1])
  })

  it('returns just the node for a root', () => {
    expect(ancestorChainIds(flat, 1)).toEqual([1])
  })

  it('returns empty when detaching to a root', () => {
    expect(ancestorChainIds(flat, null)).toEqual([])
  })

  it('stops rather than looping on cyclic data', () => {
    const cyclic = [
      { id: 1, parentRoleId: 2 },
      { id: 2, parentRoleId: 1 },
    ]
    expect(ancestorChainIds(cyclic, 1)).toEqual([1, 2])
  })
})

describe('subtreeHeight — how far the move drags descendants', () => {
  const flat = [
    { id: 1, parentRoleId: null },
    { id: 2, parentRoleId: 1 },
    { id: 3, parentRoleId: 2 },
  ]

  it('is 0 for a leaf', () => {
    expect(subtreeHeight(flat, 3)).toBe(0)
  })

  it('counts levels below, not nodes', () => {
    expect(subtreeHeight(flat, 1)).toBe(2)
  })

  it('terminates on cyclic data', () => {
    const cyclic = [
      { id: 1, parentRoleId: 2 },
      { id: 2, parentRoleId: 1 },
    ]
    expect(subtreeHeight(cyclic, 1)).toBeGreaterThanOrEqual(0)
  })
})

describe('descendantIds — what a node may not be moved under', () => {
  const flat = [
    { id: 1, parentRoleId: null },
    { id: 2, parentRoleId: 1 },
    { id: 3, parentRoleId: 2 },
    { id: 4, parentRoleId: 1 },
  ]

  it('returns every node below, at any depth', () => {
    expect(descendantIds(flat, 1).sort()).toEqual([2, 3, 4])
  })

  it('returns nothing for a leaf', () => {
    expect(descendantIds(flat, 3)).toEqual([])
  })

  it('excludes the node itself — the caller adds that separately', () => {
    expect(descendantIds(flat, 2)).toEqual([3])
  })

  it('terminates on cyclic data', () => {
    const cyclic = [
      { id: 1, parentRoleId: 2 },
      { id: 2, parentRoleId: 1 },
    ]
    expect(descendantIds(cyclic, 1).length).toBeLessThanOrEqual(2)
  })
})
