import type JsZip from 'jszip'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
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
    birthDate: string | null
    baptismDate: string | null
    isHelder: boolean
    isServant: boolean
    isAnointed: boolean
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
        birthDate: record.birthDate ? new Date(record.birthDate) : null,
        baptismDate: record.baptismDate ? new Date(record.baptismDate) : null,
        isHelder: record.isHelder,
        isServant: record.isServant,
        isAnointed: record.isAnointed,
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

export async function importCongregationUserPermissions(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  permissionKeyToId: Map<string, number>,
  congregationId: number,
): Promise<void> {
  // Pre-#152 archives use the legacy `congregation-user-roles.ndjson` shape with `roleKey`.
  // The rename was a pure terminology change (UserRole table → Permission), so the keys are
  // identical and route through the same `permissionKeyToId` map.
  const records = await readNdjsonFile<{ userId: number; permissionKey: string }>(zip, 'congregation-user-permissions')
  const legacyRecords =
    records.length === 0
      ? (await readNdjsonFile<{ userId: number; roleKey: string }>(zip, 'congregation-user-roles')).map(r => ({
          userId: r.userId,
          permissionKey: r.roleKey,
        }))
      : []
  const merged = records.length > 0 ? records : legacyRecords

  for (const record of merged) {
    const userId = idMap.getOptional('user-accounts', record.userId)
    const permissionId = permissionKeyToId.get(record.permissionKey)
    if (!userId || !permissionId) continue

    const existing = await db.congregationUserPermission.findFirst({
      where: { userId, permissionId, congregationId },
    })
    if (!existing) {
      await db.congregationUserPermission.create({
        data: { userId, permissionId, congregationId },
      })
    }
  }
}
