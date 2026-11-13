import * as m from '~/i18n/paraglide/messages'
import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import {
  isIdentityRoleKey,
  isServiceCommitteePostKey,
  SERVICE_COMMITTEE_KEY,
} from '~/shared/domain/built-in-roles.server'
import type { SeatKind } from '~/shared/domain/organigram.queries'
import {
  findGivenSeat,
  giveRole,
  holderOfMember,
  type RoleHolder,
  takeRole,
} from '~/shared/domain/role-assignments.server'
import {
  type ActorPermissions,
  assertActorHoldsRolePermissions,
  assertMayChangeAccountAccess,
  roleGrantsAdmin,
} from '~/shared/domain/role-grant-limits.server'
import { syncServiceCommitteeMembers } from '~/shared/domain/service-committee.server'
import { ForbiddenError, NotFoundError, ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Who sits in a node, as opposed to how the nodes are arranged.
//
// Split from `organigram.server.ts` because the two answer different questions and the file was
// within three lines of its budget: that one moves boxes, this one puts people in them.

// Getters, so each message reads the language of the request that raises it, not the one the
// module happened to load in.
export const ORGANIGRAM_ERRORS = {
  get postRequiresElder() {
    return m.organigram_error_post_requires_elder()
  },
  get rosterIsSynced() {
    return m.organigram_error_roster_is_synced()
  },
}

async function requireRole(db: TransactionClient, roleId: number, congregationId: number) {
  const role = await db.role.findFirst({
    where: { id: roleId, congregationId },
    select: { id: true, key: true, parentRoleId: true, isSinglePerson: true },
  })
  if (!role) throw new NotFoundError('Role', roleId)
  return role
}

/** The person to seat: any current record of the congregation, with or without a login. */
async function requireSeatableHolder(db: TransactionClient, memberId: number, congregationId: number) {
  const holder = await holderOfMember(db, memberId, congregationId)
  if (!holder) throw new NotFoundError('Member', memberId)
  return holder
}

/** The other titulaires of a role — the ones a new titulaire replaces — wherever their seat is kept. */
async function outgoingTitulaires(
  db: TransactionClient,
  roleId: number,
  incoming: RoleHolder,
  congregationId: number,
): Promise<RoleHolder[]> {
  // `NOT: { userId: undefined }` would match nothing, so each exclusion is added only when there is something to exclude.
  const onRecord = await db.memberRoleAssignment.findMany({
    where: {
      roleId,
      congregationId,
      kind: 'leader',
      ...(incoming.memberId != null ? { NOT: { memberId: incoming.memberId } } : {}),
    },
    select: { memberId: true, member: { select: { account: { select: { id: true } } } } },
  })
  const onLogin = await db.userRoleAssignment.findMany({
    where: {
      roleId,
      congregationId,
      kind: 'leader',
      ...(incoming.userId != null ? { NOT: { userId: incoming.userId } } : {}),
    },
    select: { userId: true, user: { select: { memberId: true } } },
  })
  return [
    ...onRecord.map(row => ({ memberId: row.memberId, userId: row.member.account?.id ?? null })),
    ...onLogin.map(row => ({ memberId: row.user.memberId, userId: row.userId })),
  ]
}

/**
 * The roles a seat grants: the node itself, plus the service committee for a post's titulaire,
 * since the committee's membership is derived from its posts.
 */
async function rolesGrantedBySeat(
  db: TransactionClient,
  role: { id: number; key: string },
  seatKind: SeatKind,
  congregationId: number,
): Promise<number[]> {
  if (!isServiceCommitteePostKey(role.key) || seatKind !== 'leader') return [role.id]
  const committee = await db.role.findFirst({
    where: { congregationId, key: SERVICE_COMMITTEE_KEY },
    select: { id: true },
  })
  return committee ? [role.id, committee.id] : [role.id]
}

interface SeatCheck {
  role: { id: number; key: string }
  holder: RoleHolder
  seatKind: SeatKind
  isPost: boolean
  /** The titulaires a new titulaire replaces. */
  outgoing: RoleHolder[]
  congregationId: number
  actorPermissions: ActorPermissions
}

/** Every refusal of a seating, checked before any write so a refusal never leaves a seat half changed. */
async function assertMaySeat(db: TransactionClient, check: SeatCheck): Promise<void> {
  const { role, holder, seatKind, isPost, outgoing, congregationId, actorPermissions } = check
  // A seat grants the role's permissions: the same limits as the role matrix. Without a login they give no access
  // yet, so only the actor's own limit applies.
  if (holder.userId != null) await assertMayChangeAccountAccess(holder.userId, congregationId, actorPermissions)
  await assertActorHoldsRolePermissions(
    db,
    await rolesGrantedBySeat(db, role, seatKind, congregationId),
    congregationId,
    actorPermissions,
  )
  // A new titulaire unseats the outgoing one (the handover): that is a revocation, held to the same limits as
  // unseatMember.
  const grantsAdmin = outgoing.length > 0 && (await roleGrantsAdmin(db, role.id, congregationId))
  for (const leaving of outgoing) {
    if (leaving.userId == null) continue
    await assertMayChangeAccountAccess(leaving.userId, congregationId, actorPermissions)
    if (grantsAdmin) await requireNotLastAdmin(leaving.userId, congregationId)
  }
  // The three committee titulaires are elders. The rule is about who *holds* the post, not who helps them — an
  // adjoint need not be an elder.
  if (isPost && seatKind === 'leader') {
    const isElder = await db.memberRoleAssignment.findFirst({
      where: { memberId: holder.memberId ?? -1, congregationId, role: { key: 'elder' } },
      select: { memberId: true },
    })
    if (!isElder) throw new ValidationError('memberId', ORGANIGRAM_ERRORS.postRequiresElder)
  }
}

export interface SeatInput {
  roleId: number
  memberId: number
  kind: SeatKind
}

/** Put someone in a node, or change the seat they already occupy there. */
export async function seatMember(
  db: TransactionClient,
  { roleId, memberId, kind }: SeatInput,
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
): Promise<void> {
  const role = await requireRole(db, roleId, congregationId)
  // Identity memberships are synced from Member flags, never granted: a hand-written seat on one
  // would hand out the roster's permissions and outlive every sync. `addToRole` refuses these,
  // and this path must be no wider than that one.
  if (isIdentityRoleKey(role.key)) throw new ForbiddenError(ORGANIGRAM_ERRORS.rosterIsSynced)
  const holder = await requireSeatableHolder(db, memberId, congregationId)

  // A personal role has one titulaire and, optionally, adjoints: a plain «membre» seat does not
  // exist on it, so an unqualified request means the titular seat. The committee posts carry the
  // flag; the key check backstops rows restored from an archive that predates it.
  const isPost = isServiceCommitteePostKey(role.key)
  const isSingle = role.isSinglePerson || isPost
  const seatKind = isSingle && kind !== 'deputy' ? 'leader' : kind

  const outgoing = isSingle && seatKind === 'leader' ? await outgoingTitulaires(db, roleId, holder, congregationId) : []
  await assertMaySeat(db, { role, holder, seatKind, isPost, outgoing, congregationId, actorPermissions })

  const existing = await findGivenSeat(db, holder, role, congregationId)

  // Deliberately not an early return when the seat is unchanged: the committee reconcile below
  // must still run. That makes seating self-healing — it repairs a committee whose membership
  // drifted, rather than requiring someone to guess which seat to poke.
  const unchanged = existing === seatKind
  if (!unchanged) await giveRole(db, holder, role, congregationId, seatKind)

  // Seating a new titulaire *is* the handover: the outgoing holder leaves the role, and with
  // it the permissions it carries. Only the titular seat is swept — the adjoints stay through
  // a handover, on the committee posts as on any personal role.
  for (const leaving of outgoing) await takeRole(db, leaving, role, congregationId)
  // The committee is made of its three titulaires, so its membership follows the posts.
  if (isPost) {
    await syncServiceCommitteeMembers(db, congregationId, actorId)
  }

  if (!unchanged) {
    audit({
      action: AuditAction.UserRoleAssignmentChanged,
      congregationId,
      actorId,
      entityType: 'Member',
      entityId: memberId,
      metadata: { added: existing ? [] : [role.key], removed: [], kind: seatKind },
    })
  }
}

/** Take someone out of one node, leaving every other seat they hold untouched. */
export async function unseatMember(
  db: TransactionClient,
  roleId: number,
  memberId: number,
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
): Promise<void> {
  const role = await requireRole(db, roleId, congregationId)
  const holder = await requireSeatableHolder(db, memberId, congregationId)

  // Unseating revokes what the seat granted: the same limits as the role matrix.
  if (holder.userId != null) await assertMayChangeAccountAccess(holder.userId, congregationId, actorPermissions)
  await assertActorHoldsRolePermissions(
    db,
    await rolesGrantedBySeat(db, role, 'leader', congregationId),
    congregationId,
    actorPermissions,
  )
  if (holder.userId != null && (await roleGrantsAdmin(db, roleId, congregationId))) {
    await requireNotLastAdmin(holder.userId, congregationId)
  }

  await takeRole(db, holder, role, congregationId)

  // Leaving a post leaves the committee. Half a handover is worse than none: the permissions
  // the post carries would stay with someone who no longer holds it.
  if (isServiceCommitteePostKey(role.key)) {
    await syncServiceCommitteeMembers(db, congregationId, actorId)
  }

  audit({
    action: AuditAction.UserRoleAssignmentChanged,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
    metadata: { added: [], removed: [role.key] },
  })
}
