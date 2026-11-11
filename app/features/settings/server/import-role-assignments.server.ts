import type JsZip from 'jszip'
import { isIdentityRoleKey } from '~/shared/domain/built-in-roles.server'
import { isLoginOnlyRole } from '~/shared/domain/role-assignments.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

// Restoring who holds which role. A role given by hand belongs to the person: on their record when they have one, on
// the login only for an account without a record and for login-only roles such as `admin`. That is the rule of
// migration 20261111120000_move_given_roles_onto_member, and the two must agree, so a restored backup — of any
// version — gives exactly what migrating live data did.

interface RecordRow {
  memberId: number
  roleId: number
  congregationId: number
  kind: string
}

interface LoginRow {
  userId: number
  roleId: number
  congregationId: number
  kind: string
}

async function roleKeys(db: TransactionClient, roleIds: number[]): Promise<Map<number, string>> {
  if (roleIds.length === 0) return new Map()
  const roles = await db.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, key: true } })
  return new Map(roles.map(role => [role.id, role.key]))
}

/**
 * The roles held by logins. Archives up to 2.11 carry every given role here; a login linked to a record hands its
 * roles to that record. `kind` decides who leads a service: archives taken before seats existed have none, and those
 * rows were all plain members, which is what the default restores.
 */
export async function importUserRoleAssignments(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const archived = await readNdjsonFile<{ userId: number; roleId: number; kind?: string }>(zip, 'user-role-assignments')
  const rows = archived.flatMap(record => {
    const userId = idMap.getOptional('user-accounts', record.userId)
    const roleId = idMap.getOptional('roles', record.roleId)
    return userId && roleId ? [{ userId, roleId, congregationId, kind: record.kind ?? 'member' }] : []
  })
  if (rows.length === 0) return

  const keys = await roleKeys(db, [...new Set(rows.map(row => row.roleId))])
  const accounts = await db.userAccount.findMany({
    where: { id: { in: [...new Set(rows.map(row => row.userId))] }, congregationId },
    select: { id: true, memberId: true },
  })
  const recordOf = new Map(accounts.map(account => [account.id, account.memberId]))

  const onRecord: RecordRow[] = []
  const onLogin: LoginRow[] = []
  for (const row of rows) {
    const memberId = recordOf.get(row.userId)
    if (memberId != null && !isLoginOnlyRole(keys.get(row.roleId) ?? '')) {
      onRecord.push({ memberId, roleId: row.roleId, congregationId, kind: row.kind })
    } else {
      onLogin.push(row)
    }
  }
  // The composite keys absorb what the member import's identity sync already wrote.
  if (onRecord.length > 0) await db.memberRoleAssignment.createMany({ data: onRecord, skipDuplicates: true })
  if (onLogin.length > 0) await db.userRoleAssignment.createMany({ data: onLogin, skipDuplicates: true })
}

/**
 * The roles held by records, from 2.12 on with their seat. Identity roles are skipped: the member import synced them
 * from the record's flags, which are the truth for those.
 */
export async function importMemberRoleAssignments(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const archived = await readNdjsonFile<{ memberId: number; roleId: number; kind?: string }>(
    zip,
    'member-role-assignments',
  )
  const rows = archived.flatMap(record => {
    const memberId = idMap.getOptional('members', record.memberId)
    const roleId = idMap.getOptional('roles', record.roleId)
    return memberId && roleId ? [{ memberId, roleId, congregationId, kind: record.kind ?? 'member' }] : []
  })
  if (rows.length === 0) return

  const keys = await roleKeys(db, [...new Set(rows.map(row => row.roleId))])
  const given = rows.filter(row => !isIdentityRoleKey(keys.get(row.roleId) ?? ''))
  if (given.length > 0) await db.memberRoleAssignment.createMany({ data: given, skipDuplicates: true })
}
