import type JsZip from 'jszip'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { ensureAdminRole } from '~/shared/domain/setup.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import type { PublisherType } from '~/shared/types/publisher-type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-user-accounts')

// Password that can never match any valid scrypt hash
const IMPORTED_PASSWORD_PLACEHOLDER = '$IMPORTED$'

export async function importMembers(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  interface ExportedMember {
    id: number
    firstname: string
    lastname: string
    isPublisher: boolean
    type: string
    isMale: boolean | null
    phone: string
    address: string
    // Optional: absent in archives from before the contact-email column.
    email?: string
    birthDate: string | null
    baptismDate: string | null
    isHelder: boolean
    isServant: boolean
    isAnointed: boolean
    // Optional: absent in pre-2.2 archives.
    dpaCardUpToDate?: boolean
    survivalBackpackReady?: boolean
    leftAt: string | null
    inactiveAt: string | null
    anonymizedAt: string | null
    publisherGroupId: number | null
    createdAt: string
    updatedAt: string
  }

  const records = await readNdjsonFile<ExportedMember>(zip, 'members')
  for (const record of records) {
    const created = await db.member.create({
      data: {
        firstname: record.firstname,
        lastname: record.lastname,
        firstnameNormalized: stripDiacritics(record.firstname),
        lastnameNormalized: stripDiacritics(record.lastname),
        isPublisher: record.isPublisher,
        type: record.type as PublisherType,
        isMale: record.isMale,
        phone: record.phone,
        address: record.address,
        email: record.email ?? '',
        birthDate: record.birthDate ? new Date(record.birthDate) : null,
        baptismDate: record.baptismDate ? new Date(record.baptismDate) : null,
        isHelder: record.isHelder,
        isServant: record.isServant,
        isAnointed: record.isAnointed,
        dpaCardUpToDate: record.dpaCardUpToDate ?? false,
        survivalBackpackReady: record.survivalBackpackReady ?? false,
        leftAt: record.leftAt ? new Date(record.leftAt) : null,
        inactiveAt: record.inactiveAt ? new Date(record.inactiveAt) : null,
        anonymizedAt: record.anonymizedAt ? new Date(record.anonymizedAt) : null,
        congregationId,
      },
    })
    idMap.set('members', record.id, created.id)
    await syncBuiltInRoleAssignments(db, created.id, congregationId, null)
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: legacy import path branches on existing account state — grandfathered
export async function importUserAccounts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  interface ExportedAccount {
    id: number
    memberId: number | null
    firstname: string | null
    lastname: string | null
    email: string
    active: boolean
    emailVerifiedAt: string | null
    platformAdmin: boolean
    anonymizedAt: string | null
    createdAt: string
    updatedAt: string
  }

  const records = await readNdjsonFile<ExportedAccount>(zip, 'user-accounts')
  for (const record of records) {
    const existing = await db.userAccount.findFirst({ where: { email: record.email } })

    if (existing) {
      if (existing.congregationId === congregationId) {
        const newMemberId = record.memberId != null ? idMap.getOptional('members', record.memberId) : null
        await db.userAccount.update({
          where: { id_congregationId: { id: existing.id, congregationId } },
          data: {
            firstname: record.firstname,
            lastname: record.lastname,
            active: record.active,
            memberId: newMemberId,
          },
        })
        idMap.set('user-accounts', record.id, existing.id)
      } else {
        logger.warn(`Skipping account ${record.email}: exists in another congregation`, { congregationId })
      }
    } else {
      const newMemberId = record.memberId != null ? idMap.getOptional('members', record.memberId) : null
      const created = await db.userAccount.create({
        data: {
          firstname: record.firstname,
          lastname: record.lastname,
          email: record.email,
          password: IMPORTED_PASSWORD_PLACEHOLDER,
          active: record.active,
          emailVerifiedAt: record.emailVerifiedAt ? new Date(record.emailVerifiedAt) : null,
          platformAdmin: false,
          anonymizedAt: record.anonymizedAt ? new Date(record.anonymizedAt) : null,
          memberId: newMemberId,
          congregationId,
        },
      })
      idMap.set('user-accounts', record.id, created.id)
    }
  }
}

export async function importUserRoleAssignments(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ userId: number; roleId: number }>(zip, 'user-role-assignments')
  const data: { userId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const userId = idMap.getOptional('user-accounts', record.userId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!userId || !roleId) continue
    data.push({ userId, roleId, congregationId })
  }

  if (data.length > 0) {
    // syncBuiltInRoleAssignments inside importUsers already inserted built-in role rows
    // matching each user's boolean flags. The composite (userId, roleId) PK absorbs duplicates;
    // this call adds custom-role memberships and any built-in assignments the source had that
    // the boolean-flag heuristic doesn't reproduce.
    await db.userRoleAssignment.createMany({ data, skipDuplicates: true })
  }
}

/**
 * Import the direct permission grants carried by a pre-#149 archive.
 *
 * The `CongregationUserPermission` table those rows described no longer exists, and
 * neither does the role-per-permission shape that briefly replaced it. This mirrors
 * `20260826120000_replace_auto_roles_with_admin_role`: an `admin` grant becomes the
 * `admin` system role, and every other legacy grant is dropped with a warning rather
 * than minting a synthetic role for it.
 *
 * Dropping is deliberate. A restored archive lands with the permissions its roles
 * carry; whoever restores it re-grants anything the legacy direct edge held. The
 * warning names each one so that is a decision, not a surprise.
 *
 * Current archives carry no such file and this is a no-op for them; roles,
 * role-permissions and role assignments travel as their own entities.
 */
interface LegacyGrantRecord {
  userId: number
  permissionKey: string
}

/**
 * The direct grants an archive carries, under either filename.
 *
 * Pre-#152 archives use `congregation-user-roles.ndjson` with a `roleKey` field. The
 * rename was a pure terminology change (UserRole table → Permission) and the key values
 * were preserved, so both shapes route through the same `permissionKeyToId` map.
 */
async function readLegacyGrantRecords(zip: JsZip): Promise<LegacyGrantRecord[]> {
  const records = await readNdjsonFile<LegacyGrantRecord>(zip, 'congregation-user-permissions')
  if (records.length > 0) return records

  const legacy = await readNdjsonFile<{ userId: number; roleKey: string }>(zip, 'congregation-user-roles')
  return legacy.map(r => ({ userId: r.userId, permissionKey: r.roleKey }))
}

export async function importCongregationUserPermissions(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  permissionKeyToId: Map<string, number>,
  congregationId: number,
): Promise<void> {
  const merged = await readLegacyGrantRecords(zip)
  const roleIdByPermission = new Map<number, number>()

  for (const record of merged) {
    const userId = idMap.getOptional('user-accounts', record.userId)
    const permissionId = permissionKeyToId.get(record.permissionKey)

    // Both misses drop a grant the archive says someone had, so neither is
    // allowed to pass silently — a restore that quietly returns less access
    // than it was given looks like a success to the admin who ran it.
    if (!userId) {
      logger.warn('Skipping permission grant: the archive user is not in the import map', {
        congregationId,
        sourceUserId: record.userId,
        permissionKey: record.permissionKey,
      })
      continue
    }
    if (!permissionId) {
      logger.warn('Skipping permission grant: permission key is not seeded in this database', {
        congregationId,
        sourceUserId: record.userId,
        permissionKey: record.permissionKey,
      })
      continue
    }

    if (record.permissionKey !== Permission.Admin) {
      logger.warn('Dropping legacy direct permission grant: no role carries it in the current model', {
        congregationId,
        sourceUserId: record.userId,
        permissionKey: record.permissionKey,
      })
      continue
    }

    let roleId = roleIdByPermission.get(permissionId)
    if (roleId === undefined) {
      const adminRoleId = await ensureAdminRole(db, congregationId)
      if (adminRoleId == null) {
        logger.warn('Dropping legacy admin grant: the admin role could not be resolved', {
          congregationId,
          sourceUserId: record.userId,
        })
        continue
      }
      roleId = adminRoleId
      roleIdByPermission.set(permissionId, roleId)
    }

    const existing = await db.userRoleAssignment.findFirst({ where: { userId, roleId }, select: { userId: true } })
    if (!existing) {
      await db.userRoleAssignment.create({ data: { userId, roleId, congregationId } })
    }
  }
}
