import type {
  CommitteeTakeover,
  OrganigramManage,
  OrganigramPage,
  PanelRole,
} from '~/features/congregation/model/organigram-page.type'
import {
  buildOffChartPanel,
  buildRolePanel,
  buildRolePickers,
} from '~/features/congregation/server/organigram-panel.server'
import { SERVICE_COMMITTEE_KEY } from '~/shared/domain/built-in-roles.server'
import { getOffChartRole, getOrganigram, type OrganigramNode } from '~/shared/domain/organigram.queries'
import { proposeCommitteeAdoption } from '~/shared/domain/organigram-adoption.server'
import { type FlatEntry, flattenTree } from '~/shared/domain/organigram-layout'
import type { TransactionClient } from '~/shared/infra/db.server'

// Everything the organigram page shows: the chart, the selected role's panel, and — for those who arrange it — who can
// be named, what can be attached, and the committee still to take over.

const personName = (person: { firstname: string | null; lastname: string | null }) =>
  `${person.firstname ?? ''} ${person.lastname?.toLocaleUpperCase() ?? ''}`.trim()

async function loadCommitteeTakeover(
  db: TransactionClient,
  congregationId: number,
  tree: OrganigramNode[],
): Promise<CommitteeTakeover | null> {
  const proposal = await proposeCommitteeAdoption(db, congregationId)
  if (proposal.alreadyAdopted) return null
  const flat = flattenTree(tree)
  const counts = await db.rolePermission.groupBy({
    by: ['roleId'],
    where: { roleId: { in: proposal.candidates.map(candidate => candidate.id) }, congregationId },
    // biome-ignore lint/style/useNamingConvention: Prisma aggregate field
    _count: { permissionId: true },
  })
  const permissionsOf = new Map(counts.map(row => [row.roleId, row._count.permissionId]))
  return {
    posts: proposal.posts,
    candidates: proposal.candidates.map(candidate => {
      const node = flat.find(entry => entry.id === candidate.id)?.node
      const leader = node?.holders.find(holder => holder.kind === 'leader') ?? node?.holders[0]
      return {
        id: candidate.id,
        name: candidate.name,
        leader: leader ? personName(leader) : null,
        children: node?.children.map(child => child.name) ?? [],
        permissionCount: permissionsOf.get(candidate.id) ?? 0,
      }
    }),
  }
}

async function loadManage(
  db: TransactionClient,
  congregationId: number,
  tree: OrganigramNode[],
): Promise<OrganigramManage> {
  const [roles, members] = await Promise.all([
    db.role.findMany({
      where: { congregationId, showInOrganigram: false },
      select: {
        id: true,
        key: true,
        name: true,
        // biome-ignore lint/style/useNamingConvention: Prisma aggregate field
        _count: { select: { members: true, memberAssignments: true } },
      },
      orderBy: [{ name: 'asc' }, { key: 'asc' }],
    }),
    db.member.findMany({
      where: { congregationId, leftAt: null, anonymizedAt: null },
      select: { id: true, firstname: true, lastname: true, isHelder: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    }),
  ])
  const { adoptable, rosters } = buildRolePickers(roles)
  const holders = new Map(roles.map(role => [role.id, role._count.members + role._count.memberAssignments]))
  return {
    people: members.map(({ id, firstname, lastname }) => ({ id, firstname, lastname })),
    nonElderIds: members.filter(member => !member.isHelder).map(member => member.id),
    offChart: adoptable.map(role => ({ ...role, holderCount: holders.get(role.id) ?? 0 })),
    rosters,
    places: flattenTree(tree).map(({ id, label }) => ({ id, label })),
    // The built-in committee exists but was never placed: this congregation built its chart before the committee was
    // structured, and is offered the takeover instead.
    committee: roles.some(role => role.key === SERVICE_COMMITTEE_KEY)
      ? await loadCommitteeTakeover(db, congregationId, tree)
      : null,
  }
}

/** The selected role's panel: a role of the chart, or one outside it (a role the congregation made). */
async function loadPanel(
  db: TransactionClient,
  congregationId: number,
  flat: FlatEntry[],
  selectedId: number | null,
): Promise<PanelRole | null> {
  if (selectedId == null) return null
  const details = await db.role.findFirst({
    where: { id: selectedId, congregationId },
    select: { description: true, isBuiltIn: true },
  })
  if (!details) return null
  const index = flat.findIndex(entry => entry.id === selectedId)
  if (index >= 0) return buildRolePanel(flat, index, details)
  const node = await getOffChartRole(db, selectedId, congregationId)
  return node
    ? buildOffChartPanel(
        node,
        details,
        flat.map(({ id, label }) => ({ id, label })),
      )
    : null
}

export async function loadOrganigramPage(
  db: TransactionClient,
  congregationId: number,
  options: { canManage: boolean; selectedId: number | null },
): Promise<OrganigramPage> {
  const tree = await getOrganigram(db, congregationId)
  const flat = flattenTree(tree)
  const boardDocument = await db.boardDynamicDocumentSettings.findFirst({
    where: { dynamicType: 'organigram', section: { congregationId } },
    select: { id: true },
  })

  return {
    tree,
    panel: await loadPanel(db, congregationId, flat, options.selectedId),
    boardDocumentId: boardDocument?.id ?? null,
    manage: options.canManage ? await loadManage(db, congregationId, tree) : null,
  }
}
