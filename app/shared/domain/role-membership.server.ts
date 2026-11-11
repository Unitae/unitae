import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { assertMayActOnAccount } from '~/shared/domain/account-protection.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { isIdentityRoleKey, SYSTEM_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
import { giveRole, type RoleHolder, takeRole } from '~/shared/domain/role-assignments.server'
import {
  type ActorPermissions,
  assertActorHoldsRolePermissions,
  assertMayChangeAccountAccess,
  roleGrantsAdmin,
} from '~/shared/domain/role-grant-limits.server'
import { ForbiddenError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// Giving and taking roles by hand: the team matrix, a person's account page. The organigram seats people through
// organigram-seats.server.ts, with its own handover rules; both store through role-assignments.server.ts, which puts a
// role on the person's record (whether or not they can sign in) and keeps system roles such as `admin` on the login.

/**
 * Roles given by hand from a list: custom roles, plus system roles such as `admin`. Identity roles are excluded —
 * they are reconciled from the record's flags, so accepting one here would be overwritten on the next sync. Personal
 * roles are excluded too: their one seat is given from the organigram with a handover, never from a checkbox, and
 * because the filter applies to both sides of a diff, a titulaire keeps their seat when their teams are edited.
 */
export function handGivenRole() {
  return { isSinglePerson: false, OR: [{ isBuiltIn: false }, { key: { in: [...SYSTEM_ROLE_KEYS] } }] }
}

/**
 * The guards for changing a holder's roles. With a login: nobody removes their own roles, and an administrator's
 * roles are changed by administrators only. Always: the actor must hold every permission the roles carry. Without a
 * login, the roles give no access yet, so only that last rule applies.
 */
async function assertMayChangeRoles(
  db: TransactionClient,
  holder: RoleHolder,
  roleIds: number[],
  removing: boolean,
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
): Promise<void> {
  if (holder.userId != null) {
    if (removing) {
      await assertMayActOnAccount({
        accountId: holder.userId,
        actorId,
        congregationId,
        actorPermissions,
        action: 'remove-roles',
      })
    } else {
      await assertMayChangeAccountAccess(holder.userId, congregationId, actorPermissions)
    }
  }
  await assertActorHoldsRolePermissions(db, roleIds, congregationId, actorPermissions)
}

/** The audit subject of a role change: the record when there is one, the login otherwise. */
function auditSubject(holder: RoleHolder): { entityType: string; entityId: number } {
  return holder.memberId != null
    ? { entityType: 'Member', entityId: holder.memberId }
    : { entityType: 'User', entityId: holder.userId as number }
}

/** The seat a holder has in a role, wherever it is kept. */
async function currentSeat(
  db: TransactionClient,
  holder: RoleHolder,
  roleId: number,
  congregationId: number,
): Promise<string | null> {
  const onRecord =
    holder.memberId == null
      ? null
      : await db.memberRoleAssignment.findFirst({
          where: { memberId: holder.memberId, roleId, congregationId },
          select: { kind: true },
        })
  if (onRecord) return onRecord.kind
  const onLogin =
    holder.userId == null
      ? null
      : await db.userRoleAssignment.findFirst({
          where: { userId: holder.userId, roleId, congregationId },
          select: { kind: true },
        })
  return onLogin?.kind ?? null
}

/** Puts a holder in a team (a role given by hand, as a plain member). Nothing happens if they are already in it. */
export async function addToRole(
  db: TransactionClient,
  holder: RoleHolder,
  roleId: number,
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
): Promise<void> {
  const role = await db.role.findFirst({ where: { id: roleId, congregationId } })
  if (!role) return
  // Identity memberships come from the record's flags. System roles such as `admin` are also built in, but given by
  // hand, so the key decides, not the flag.
  if (isIdentityRoleKey(role.key)) throw new ForbiddenError('Identity role memberships are managed automatically')
  // A personal role has one titulaire and adjoints, never plain members: its seat is given from the organigram.
  if (role.isSinglePerson) throw new ForbiddenError('Personal roles are seated from the organigram')

  if ((await currentSeat(db, holder, roleId, congregationId)) != null) return
  await assertMayChangeRoles(db, holder, [roleId], false, congregationId, actorId, actorPermissions)
  await giveRole(db, holder, role, congregationId)

  audit({
    action: AuditAction.UserRoleAssignmentChanged,
    congregationId,
    actorId,
    ...auditSubject(holder),
    metadata: { added: [role.key], removed: [] },
  })
}

/** Takes a holder out of a team. A responsable's or an adjoint's seat changes hands on the organigram, not here. */
export async function removeFromRole(
  db: TransactionClient,
  holder: RoleHolder,
  roleId: number,
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
): Promise<void> {
  const role = await db.role.findFirst({ where: { id: roleId, congregationId } })
  if (!role) return
  if (isIdentityRoleKey(role.key)) throw new ForbiddenError('Identity role memberships are managed automatically')

  const seat = await currentSeat(db, holder, roleId, congregationId)
  if (seat == null) return
  // One stray uncheck in the matrix must not silently unseat a responsable or an adjoint.
  if (seat === 'leader' || seat === 'deputy')
    throw new ForbiddenError('Leadership seats are managed from the organigram')

  await assertMayChangeRoles(db, holder, [roleId], true, congregationId, actorId, actorPermissions)
  if (holder.userId != null && (await roleGrantsAdmin(db, roleId, congregationId))) {
    await requireNotLastAdmin(holder.userId, congregationId)
  }
  await takeRole(db, holder, role, congregationId)

  audit({
    action: AuditAction.UserRoleAssignmentChanged,
    congregationId,
    actorId,
    ...auditSubject(holder),
    metadata: { added: [], removed: [role.key] },
  })
}

/** The roles given by hand that a holder has, on the record and on the login. */
async function heldGivenRoleIds(
  db: TransactionClient,
  holder: RoleHolder,
  congregationId: number,
): Promise<Set<number>> {
  const onRecord =
    holder.memberId == null
      ? []
      : await db.memberRoleAssignment.findMany({
          where: { memberId: holder.memberId, congregationId, role: handGivenRole() },
          select: { roleId: true },
        })
  const onLogin =
    holder.userId == null
      ? []
      : await db.userRoleAssignment.findMany({
          where: { userId: holder.userId, congregationId, role: handGivenRole() },
          select: { roleId: true },
        })
  return new Set([...onRecord, ...onLogin].map(row => row.roleId))
}

/**
 * Sets the roles given by hand to a holder to exactly `roleIds` (unknown or non-assignable ids are ignored): the
 * account page's checkboxes. Roles the holder keeps are left alone, seat included.
 */
export async function setGivenRoles(
  db: TransactionClient,
  holder: RoleHolder,
  roleIds: number[],
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
): Promise<void> {
  const assignable = await db.role.findMany({
    where: { congregationId, ...handGivenRole() },
    select: { id: true, key: true },
  })
  const byId = new Map(assignable.map(role => [role.id, role]))
  const desired = new Set(roleIds.filter(id => byId.has(id)))

  const held = await heldGivenRoleIds(db, holder, congregationId)

  const added = [...desired].filter(id => !held.has(id))
  const removed = [...held].filter(id => !desired.has(id))
  if (added.length === 0 && removed.length === 0) return

  await assertMayChangeRoles(
    db,
    holder,
    [...added, ...removed],
    removed.length > 0,
    congregationId,
    actorId,
    actorPermissions,
  )
  if (holder.userId != null && removed.length > 0) {
    const removesAdmin = await db.rolePermission.findFirst({
      where: { roleId: { in: removed }, congregationId, permission: { key: Permission.CanDoAnything } },
      select: { roleId: true },
    })
    if (removesAdmin) await requireNotLastAdmin(holder.userId, congregationId)
  }

  for (const id of added) {
    const role = byId.get(id)
    if (role) await giveRole(db, holder, role, congregationId)
  }
  for (const id of removed) {
    const role = byId.get(id)
    if (role) await takeRole(db, holder, role, congregationId)
  }

  audit({
    action: AuditAction.UserRoleAssignmentChanged,
    congregationId,
    actorId,
    ...auditSubject(holder),
    metadata: {
      added: added.map(id => byId.get(id)?.key).filter(Boolean),
      removed: removed.map(id => byId.get(id)?.key).filter(Boolean),
    },
  })
}
