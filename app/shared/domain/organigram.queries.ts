import type { TransactionClient } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'

// Read side of the congregation organigram. Two flat queries and an in-memory assembly —
// deliberately not a recursive CTE and not a nested Prisma `include`.
//
// A congregation's chart is a few dozen nodes: a recursive CTE would be a new query shape to
// get right under row-level security for no measurable gain, and a nested include multiplies
// every role by every holder.

/** Seat a person occupies within a node. Mirrors `UserRoleAssignment.kind`. */
export type SeatKind = 'leader' | 'deputy' | 'member'

const SEAT_RANK: Record<string, number> = { leader: 0, deputy: 1, member: 2 }

export interface OrganigramRole {
  id: number
  key: string
  name: string | null
  isBuiltIn: boolean
  parentRoleId: number | null
  organigramOrder: number | null
  organigramNote: string | null
}

export interface OrganigramHolder {
  roleId: number
  memberId: number
  firstname: string | null
  lastname: string | null
  anonymizedAt: Date | null
  kind: SeatKind | string
}

export interface OrganigramNode {
  id: number
  name: string
  note: string | null
  /** True for the two auto-synced identity rosters, which read as a list rather than a seat. */
  isRoster: boolean
  holders: OrganigramHolder[]
  children: OrganigramNode[]
}

function compareHolders(a: OrganigramHolder, b: OrganigramHolder): number {
  const rank = (SEAT_RANK[a.kind] ?? 9) - (SEAT_RANK[b.kind] ?? 9)
  if (rank !== 0) return rank
  return (a.lastname ?? '').localeCompare(b.lastname ?? '')
}

function compareRoles(a: OrganigramRole, b: OrganigramRole): number {
  const order = (a.organigramOrder ?? 0) - (b.organigramOrder ?? 0)
  if (order !== 0) return order
  return getRoleDisplayName(a).localeCompare(getRoleDisplayName(b))
}

/**
 * Assemble flat rows into the tree.
 *
 * Two rules worth knowing about:
 *
 * - A child whose parent is absent from `roles` is **promoted to a root**, not dropped. That
 *   happens whenever a parent is un-flagged from the chart while its children stay in, and
 *   losing a whole branch without a trace is much worse than showing it detached.
 * - Traversal carries a visited set. The policy prevents cycles on write, but a hand-edited
 *   database or a bad import can still produce one, and a chart that hangs the server is a
 *   worse failure than a chart that renders oddly.
 */
export function buildOrganigramTree(roles: OrganigramRole[], holders: OrganigramHolder[]): OrganigramNode[] {
  const holdersByRole = new Map<number, OrganigramHolder[]>()
  for (const held of holders) {
    holdersByRole.set(held.roleId, [...(holdersByRole.get(held.roleId) ?? []), held])
  }

  const known = new Set(roles.map(r => r.id))
  const byParent = new Map<number, OrganigramRole[]>()
  const roots: OrganigramRole[] = []
  for (const role of roles) {
    const parentId = role.parentRoleId
    if (parentId == null || !known.has(parentId)) roots.push(role)
    else byParent.set(parentId, [...(byParent.get(parentId) ?? []), role])
  }

  const visited = new Set<number>()
  const buildNode = (role: OrganigramRole): OrganigramNode => {
    visited.add(role.id)
    return {
      id: role.id,
      name: getRoleDisplayName(role),
      note: role.organigramNote,
      isRoster: role.isBuiltIn,
      holders: (holdersByRole.get(role.id) ?? []).sort(compareHolders),
      children: (byParent.get(role.id) ?? [])
        .filter(child => !visited.has(child.id))
        .sort(compareRoles)
        .map(buildNode),
    }
  }

  const tree = roots.sort(compareRoles).map(buildNode)

  // Anything still unvisited sits in a cycle, so no root reaches it. Surface those as extra
  // roots: a chart that renders oddly beats one that silently omits branches, and beats one
  // that recurses forever.
  for (const role of roles.slice().sort(compareRoles)) {
    if (!visited.has(role.id)) tree.push(buildNode(role))
  }

  return tree
}

/** The minimum a node needs for the derivations below — every caller already has this. */
export interface TreeLink {
  id: number
  parentRoleId: number | null
}

/**
 * A node and its ancestors, nearest first — the shape `assertCanSetParent` needs.
 *
 * Guarded against cyclic rows: the policy prevents them on write, but a hand-edited database
 * must not spin a request forever. Passing `null` yields an empty chain, i.e. "make this a root".
 */
export function ancestorChainIds(links: readonly TreeLink[], startId: number | null): number[] {
  if (startId == null) return []
  const byId = new Map(links.map(link => [link.id, link]))
  const chain: number[] = []
  const seen = new Set<number>()

  let current: number | null = startId
  while (current != null && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = byId.get(current)?.parentRoleId ?? null
  }
  return chain
}

/**
 * Every node below this one, at any depth. Excludes the node itself.
 *
 * Used to work out which nodes a role may legally be moved under: offering a descendant and
 * then refusing it after a page reload teaches the same rule far less kindly.
 */
export function descendantIds(links: readonly TreeLink[], rootId: number): number[] {
  const childrenOf = new Map<number, number[]>()
  for (const link of links) {
    if (link.parentRoleId == null) continue
    childrenOf.set(link.parentRoleId, [...(childrenOf.get(link.parentRoleId) ?? []), link.id])
  }

  const found: number[] = []
  const seen = new Set<number>([rootId])
  const queue = [...(childrenOf.get(rootId) ?? [])]

  while (queue.length > 0) {
    const id = queue.shift() as number
    if (seen.has(id)) continue
    seen.add(id)
    found.push(id)
    queue.push(...(childrenOf.get(id) ?? []))
  }
  return found
}

/** Levels of descendants beneath a node: 0 for a leaf. Cycle-safe for the same reason. */
export function subtreeHeight(links: readonly TreeLink[], rootId: number): number {
  const childrenOf = new Map<number, number[]>()
  for (const link of links) {
    if (link.parentRoleId == null) continue
    childrenOf.set(link.parentRoleId, [...(childrenOf.get(link.parentRoleId) ?? []), link.id])
  }

  const walk = (id: number, seen: ReadonlySet<number>): number => {
    const children = (childrenOf.get(id) ?? []).filter(child => !seen.has(child))
    if (children.length === 0) return 0
    return 1 + Math.max(...children.map(child => walk(child, new Set([...seen, child]))))
  }
  return walk(rootId, new Set([rootId]))
}

const ORGANIGRAM_ROLE_SELECT = {
  id: true,
  key: true,
  name: true,
  isBuiltIn: true,
  parentRoleId: true,
  organigramOrder: true,
  organigramNote: true,
} as const

/**
 * The congregation's organigram, ready to render.
 *
 * Holders are unioned across both assignment tables: the identity rosters reach a person
 * through `MemberRoleAssignment` (auto-synced from Member flags) and every hand-granted seat
 * reaches them through the linked account's `UserRoleAssignment`. Reading only one of the two
 * returns half an empty chart — the canonical rule lives in
 * `app/shared/auth/permissions.server.ts`.
 */
export async function getOrganigram(db: TransactionClient, congregationId: number): Promise<OrganigramNode[]> {
  const roles = await db.role.findMany({
    where: { congregationId, showInOrganigram: true },
    select: ORGANIGRAM_ROLE_SELECT,
  })
  if (roles.length === 0) return []

  const roleIds = roles.map(role => role.id)
  const members = await db.member.findMany({
    where: {
      congregationId,
      leftAt: null,
      anonymizedAt: null,
      OR: [
        { roleAssignments: { some: { roleId: { in: roleIds } } } },
        { account: { roleAssignments: { some: { roleId: { in: roleIds } } } } },
      ],
    },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      anonymizedAt: true,
      roleAssignments: { where: { roleId: { in: roleIds } }, select: { roleId: true } },
      account: {
        select: { roleAssignments: { where: { roleId: { in: roleIds } }, select: { roleId: true, kind: true } } },
      },
    },
  })

  const holders: OrganigramHolder[] = []
  for (const member of members) {
    const base = {
      memberId: member.id,
      firstname: member.firstname,
      lastname: member.lastname,
      anonymizedAt: member.anonymizedAt,
    }
    // Identity-side rows carry no seat: roster membership is derived, never appointed.
    for (const assignment of member.roleAssignments) {
      holders.push({ ...base, roleId: assignment.roleId, kind: 'member' })
    }
    for (const assignment of member.account?.roleAssignments ?? []) {
      holders.push({ ...base, roleId: assignment.roleId, kind: assignment.kind })
    }
  }

  return buildOrganigramTree(roles, holders)
}
