import { isIdentityRoleKey, SYSTEM_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
import { ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Where a role given by hand is kept.
//
// A role is a qualification other members rely on — who may take a part, who runs the sound, who sits where in the
// organigram — so it belongs to the person: on their record (`MemberRoleAssignment`), whether or not they can sign
// in. Only two cases stay on the login (`UserRoleAssignment`): an account without a record (a circuit overseer, an
// outside administrator), and system roles such as `admin`, which are access rather than a qualification.
//
// Readers already union both tables (see app/shared/auth/permissions.server.ts); writers go through here. Writing to
// the record also removes the same role from the login, so a row left there by older code heals on the next change.

/** Who a role is given to: the record when there is one, the login when there is one; never neither. */
export interface RoleHolder {
  memberId: number | null
  userId: number | null
}

/** The role being given or taken: its key decides where it is kept. */
interface GivenRole {
  id: number
  key: string
}

export type SeatKind = 'leader' | 'deputy' | 'member'

const LOGIN_ONLY_KEYS = new Set<string>(SYSTEM_ROLE_KEYS)

/** Whether a role is kept on the login whatever the person: system roles are access, not a qualification. */
export function isLoginOnlyRole(key: string): boolean {
  return LOGIN_ONLY_KEYS.has(key)
}

/** The holder of an account of this congregation: its record if it has one, and the account. */
export async function holderOfAccount(
  db: TransactionClient,
  userId: number,
  congregationId: number,
): Promise<RoleHolder | null> {
  const account = await db.userAccount.findFirst({
    where: { id: userId, congregationId },
    select: { id: true, memberId: true },
  })
  return account ? { memberId: account.memberId, userId: account.id } : null
}

/** The holder of a record of this congregation: the record, and its login if it has one. */
export async function holderOfMember(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
): Promise<RoleHolder | null> {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, account: { select: { id: true } } },
  })
  return member ? { memberId: member.id, userId: member.account?.id ?? null } : null
}

/** Whether this role goes on the record for this holder; otherwise on the login. */
function onRecord(holder: RoleHolder, role: GivenRole): holder is RoleHolder & { memberId: number } {
  return holder.memberId != null && !isLoginOnlyRole(role.key)
}

/** The seat a holder has in a role given by hand, or null: the record's row first, then any left on the login. */
export async function findGivenSeat(
  db: TransactionClient,
  holder: RoleHolder,
  role: GivenRole,
  congregationId: number,
): Promise<string | null> {
  if (holder.memberId != null) {
    const row = await db.memberRoleAssignment.findFirst({
      where: { memberId: holder.memberId, roleId: role.id, congregationId },
      select: { kind: true },
    })
    if (row) return row.kind
  }
  if (holder.userId != null) {
    const row = await db.userRoleAssignment.findFirst({
      where: { userId: holder.userId, roleId: role.id, congregationId },
      select: { kind: true },
    })
    if (row) return row.kind
  }
  return null
}

/**
 * Gives a role, or changes the seat of one already held. Kept on the record unless the role is login-only or the
 * holder has no record; a login-only role needs a login. Writing to the record removes the role from the login.
 */
export async function giveRole(
  db: TransactionClient,
  holder: RoleHolder,
  role: GivenRole,
  congregationId: number,
  kind: SeatKind = 'member',
): Promise<void> {
  if (onRecord(holder, role)) {
    await db.memberRoleAssignment.upsert({
      where: { memberId_roleId: { memberId: holder.memberId, roleId: role.id } },
      create: { memberId: holder.memberId, roleId: role.id, congregationId, kind },
      update: { kind },
    })
    if (holder.userId != null) {
      await db.userRoleAssignment.deleteMany({ where: { userId: holder.userId, roleId: role.id, congregationId } })
    }
    return
  }
  if (holder.userId == null) {
    throw new ValidationError('memberId', 'This role needs a login')
  }
  await db.userRoleAssignment.upsert({
    where: { userId_roleId: { userId: holder.userId, roleId: role.id } },
    create: { userId: holder.userId, roleId: role.id, congregationId, kind },
    update: { kind },
  })
}

/** Takes a role off a holder, wherever it is kept. */
export async function takeRole(
  db: TransactionClient,
  holder: RoleHolder,
  role: GivenRole,
  congregationId: number,
): Promise<void> {
  if (holder.memberId != null) {
    await db.memberRoleAssignment.deleteMany({ where: { memberId: holder.memberId, roleId: role.id, congregationId } })
  }
  if (holder.userId != null) {
    await db.userRoleAssignment.deleteMany({ where: { userId: holder.userId, roleId: role.id, congregationId } })
  }
}

/**
 * When a login without a record gets one (an outside administrator who joins the congregation), the roles given to
 * the login move onto the record, seats included. Login-only roles stay on the login.
 */
export async function moveGivenRolesOntoRecord(
  db: TransactionClient,
  userId: number,
  memberId: number,
  congregationId: number,
): Promise<void> {
  const rows = await db.userRoleAssignment.findMany({
    where: { userId, congregationId },
    select: { kind: true, role: { select: { id: true, key: true } } },
  })
  for (const row of rows) {
    if (isLoginOnlyRole(row.role.key)) continue
    await giveRole(db, { memberId, userId }, row.role, congregationId, row.kind as SeatKind)
  }
}

/**
 * Takes every role given by hand off a record: when the person leaves the congregation or is anonymised. Identity
 * roles are left to `syncBuiltInRoleAssignments`, which drops them from the record's flags.
 */
export async function takeGivenRolesOfRecord(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
): Promise<void> {
  const rows = await db.memberRoleAssignment.findMany({
    where: { memberId, congregationId },
    select: { role: { select: { id: true, key: true } } },
  })
  const given = rows.filter(row => !isIdentityRoleKey(row.role.key)).map(row => row.role.id)
  if (given.length === 0) return
  await db.memberRoleAssignment.deleteMany({ where: { memberId, congregationId, roleId: { in: given } } })
}
