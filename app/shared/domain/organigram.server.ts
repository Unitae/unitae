import { AuditAction, audit } from '~/shared/domain/audit.server'
import { isServiceCommitteePostKey } from '~/shared/domain/built-in-roles.server'
import { ancestorChainIds, subtreeHeight, type TreeLink } from '~/shared/domain/organigram.queries'
import {
  assertCanLeaveOrganigram,
  assertCanSetParent,
  assertCanShowInOrganigram,
} from '~/shared/domain/role-tree.policy'
import { createRole } from '~/shared/domain/roles.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Write side of the congregation organigram. Structure lives on `Role`, seats live on
// `UserRoleAssignment.kind`, and nothing here ever touches permissions — moving a node changes
// who reports to whom, never what anyone may do.

/** Siblings are spaced 5 apart so a later insertion rarely has to renumber the row. */
const ORDER_STEP = 5

async function requireRole(db: TransactionClient, roleId: number, congregationId: number) {
  const role = await db.role.findFirst({
    where: { id: roleId, congregationId },
    select: { id: true, key: true, parentRoleId: true },
  })
  if (!role) throw new NotFoundError('Role', roleId)
  return role
}

/** Every flagged role, flat — small enough that the tree derivations run in memory. */
async function treeLinks(db: TransactionClient, congregationId: number): Promise<TreeLink[]> {
  return db.role.findMany({
    where: { congregationId, showInOrganigram: true },
    select: { id: true, parentRoleId: true },
  })
}

async function nextOrderUnder(
  db: TransactionClient,
  parentRoleId: number | null,
  congregationId: number,
): Promise<number> {
  const siblings = await db.role.findMany({
    where: { congregationId, showInOrganigram: true, parentRoleId },
    select: { organigramOrder: true },
  })
  const highest = siblings.reduce((max, s) => Math.max(max, s.organigramOrder ?? 0), 0)
  return highest + ORDER_STEP
}

/**
 * Put an existing role into the chart.
 *
 * Adoption rather than creation is the primary gesture: a congregation's roles very often
 * already *are* the boxes on its printed sheet, and creating a second «Sono» beside the one
 * that gates part eligibility would split the membership in two.
 */
export async function addRoleToOrganigram(
  db: TransactionClient,
  roleId: number,
  parentRoleId: number | null,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const role = await requireRole(db, roleId, congregationId)
  assertCanShowInOrganigram(role.key)

  const links = await treeLinks(db, congregationId)
  assertCanSetParent({
    roleId,
    roleKey: role.key,
    parentChainIds: ancestorChainIds(links, parentRoleId),
    subtreeHeight: subtreeHeight(links, roleId),
  })

  await db.role.update({
    where: { id_congregationId: { id: roleId, congregationId } },
    data: {
      showInOrganigram: true,
      parentRoleId,
      organigramOrder: await nextOrderUnder(db, parentRoleId, congregationId),
    },
  })

  audit({
    action: AuditAction.OrganigramChanged,
    congregationId,
    actorId,
    entityType: 'Role',
    entityId: roleId,
    metadata: { change: 'added', parentRoleId },
  })
}

/**
 * Create a service and put it in the chart, in one step.
 *
 * Without this, a congregation whose « Comité de service » does not exist yet has to leave for the
 * roles page, create it, come back and find it in the picker — roughly fifteen times while
 * building a first chart.
 *
 * `createRole` slugifies the name into the key and throws `ConflictError` on a collision. That is
 * deliberately not caught here: two services sharing one identity would split the same team's
 * membership in half, and the caller can say « ce service existe déjà » far better than a silent
 * rename would.
 *
 * The new service carries no permissions. Those are set in settings, never from the chart.
 */
export async function createServiceInOrganigram(
  db: TransactionClient,
  name: string,
  parentRoleId: number | null,
  congregationId: number,
  actorId: number,
): Promise<number> {
  const created = await createRole(db, congregationId, actorId, { name, description: null, permissionKeys: [] })
  await addRoleToOrganigram(db, created.id, parentRoleId, congregationId, actorId)
  return created.id
}

/**
 * Take a role out of the chart without deleting it — the role, its permissions and its members
 * all survive; only its place in the organisation is dropped.
 *
 * Children are lifted to the removed node's parent. The reader would promote them to roots
 * anyway, but silently relocating a whole branch to the top of the chart is a worse surprise
 * than closing the gap.
 */
export async function removeRoleFromOrganigram(
  db: TransactionClient,
  roleId: number,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const role = await requireRole(db, roleId, congregationId)
  // Before any write: a committee stripped of its posts and then refused would be worse than
  // either outcome alone.
  assertCanLeaveOrganigram(role.key)

  await db.role.updateMany({
    where: { congregationId, parentRoleId: roleId },
    data: { parentRoleId: role.parentRoleId },
  })

  await db.role.update({
    where: { id_congregationId: { id: roleId, congregationId } },
    data: { showInOrganigram: false, parentRoleId: null, organigramOrder: null },
  })

  audit({
    action: AuditAction.OrganigramChanged,
    congregationId,
    actorId,
    entityType: 'Role',
    entityId: roleId,
    metadata: { change: 'removed', childrenLiftedTo: role.parentRoleId },
  })
}

/** Move a node under a different parent, or to the top with `null`. */
export async function setOrganigramParent(
  db: TransactionClient,
  roleId: number,
  parentRoleId: number | null,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const role = await requireRole(db, roleId, congregationId)
  const links = await treeLinks(db, congregationId)

  assertCanSetParent({
    roleId,
    roleKey: role.key,
    parentChainIds: ancestorChainIds(links, parentRoleId),
    subtreeHeight: subtreeHeight(links, roleId),
  })

  await db.role.update({
    where: { id_congregationId: { id: roleId, congregationId } },
    data: { parentRoleId, organigramOrder: await nextOrderUnder(db, parentRoleId, congregationId) },
  })

  audit({
    action: AuditAction.OrganigramChanged,
    congregationId,
    actorId,
    entityType: 'Role',
    entityId: roleId,
    metadata: { change: 'moved', parentRoleId },
  })
}

/** Swap a node with the sibling above or below it, then renormalise the whole row. */
export async function moveOrganigramNode(
  db: TransactionClient,
  roleId: number,
  direction: 'up' | 'down',
  congregationId: number,
  actorId: number,
): Promise<void> {
  const role = await requireRole(db, roleId, congregationId)

  const siblings = await db.role.findMany({
    where: { congregationId, showInOrganigram: true, parentRoleId: role.parentRoleId },
    select: { id: true, organigramOrder: true },
  })
  const ordered = siblings.slice().sort((a, b) => (a.organigramOrder ?? 0) - (b.organigramOrder ?? 0))

  const index = ordered.findIndex(s => s.id === roleId)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index === -1 || target < 0 || target >= ordered.length) return

  const swapped = ordered.slice()
  const [moved] = swapped.splice(index, 1)
  if (!moved) return
  swapped.splice(target, 0, moved)

  // Renumber rather than swapping two values: it keeps the spacing uniform however many
  // ad-hoc orders the row has accumulated.
  for (const [position, sibling] of swapped.entries()) {
    await db.role.update({
      where: { id_congregationId: { id: sibling.id, congregationId } },
      data: { organigramOrder: (position + 1) * ORDER_STEP },
    })
  }

  audit({
    action: AuditAction.OrganigramChanged,
    congregationId,
    actorId,
    entityType: 'Role',
    entityId: roleId,
    metadata: { change: 'reordered', direction },
  })
}
