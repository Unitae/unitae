import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-configuration')

export async function importSettings(zip: JsZip, db: TransactionClient, congregationId: number): Promise<void> {
  const records = await readNdjsonFile<{ key: string; value: string }>(zip, 'settings')
  for (const record of records) {
    await db.setting.upsert({
      where: { key_congregationId: { key: record.key, congregationId } },
      update: { value: record.value },
      create: { key: record.key, value: record.value, congregationId },
    })
  }
}

export async function importRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    key: string
    name: string | null
    description: string | null
    isBuiltIn: boolean
    // Organigram columns. Absent from archives taken before the chart existed, which is why
    // every read of them tolerates undefined rather than assuming a shape.
    parentRoleId?: number | null
    showInOrganigram?: boolean
    organigramOrder?: number | null
    organigramNote?: string | null
    isSinglePerson?: boolean
  }>(zip, 'roles')

  for (const record of records) {
    const existing = await db.role.findFirst({ where: { key: record.key, congregationId } })
    if (existing) {
      // Built-in roles are pre-seeded for every congregation; map source id to existing target id.
      // Custom roles imported into a congregation that already has the same key get their
      // metadata refreshed but keep the target's id.
      await db.role.update({
        where: { id_congregationId: { id: existing.id, congregationId } },
        data: {
          name: record.name,
          description: record.description,
          isBuiltIn: record.isBuiltIn,
          showInOrganigram: record.showInOrganigram ?? false,
          organigramOrder: record.organigramOrder ?? null,
          organigramNote: record.organigramNote ?? null,
          // `undefined` leaves the column untouched: an archive from before the flag existed
          // must not strip it from the pre-seeded committee posts.
          isSinglePerson: record.isSinglePerson ?? undefined,
        },
      })
      idMap.set('roles', record.id, existing.id)
    } else {
      const created = await db.role.create({
        data: {
          key: record.key,
          name: record.name,
          description: record.description,
          isBuiltIn: record.isBuiltIn,
          congregationId,
          showInOrganigram: record.showInOrganigram ?? false,
          organigramOrder: record.organigramOrder ?? null,
          organigramNote: record.organigramNote ?? null,
          isSinglePerson: record.isSinglePerson ?? false,
        },
      })
      idMap.set('roles', record.id, created.id)
    }
  }

  await resolveOrganigramParents(records, db, idMap, congregationId)
}

/**
 * Second pass over the roles file, resolving `parentRoleId`.
 *
 * The value in the archive is a *source* id, and target ids are only known once each row has
 * been inserted — an existing role keeps the target's id, a new one gets a fresh sequence value.
 * Sorting the archive by depth, the intuitive fix, addresses ordering while the actual problem
 * is translation, so it would still write the wrong parent.
 */
async function resolveOrganigramParents(
  records: { id: number; key: string; parentRoleId?: number | null }[],
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  for (const record of records) {
    if (record.parentRoleId == null) continue

    const target = idMap.get('roles', record.id)
    // Cannot happen when the first pass ran — every record was just inserted or matched — so a
    // miss here means the map itself is broken, which deserves the same trace as a bad parent.
    if (target == null) {
      logger.warn(`Organigram parent pass: no id mapping for role "${record.key}"`, { congregationId })
      continue
    }

    const parent = idMap.get('roles', record.parentRoleId)
    // A parent missing from the archive leaves the role detached rather than throwing: the
    // reader promotes an orphan to a root, so the branch is still visible and recoverable.
    // Losing it silently, or failing the whole import, would both be worse.
    if (parent == null) {
      logger.warn(`Organigram parent missing from archive: role "${record.key}" imported detached`, {
        missingParent: record.parentRoleId,
        congregationId,
      })
      continue
    }

    await db.role.update({
      where: { id_congregationId: { id: target, congregationId } },
      data: { parentRoleId: parent },
    })
  }
}

export async function importRolePermissions(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  permissionKeyToId: Map<string, number>,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ roleId: number; permissionKey: string }>(zip, 'role-permissions')
  const data: { roleId: number; permissionId: number; congregationId: number }[] = []

  for (const record of records) {
    const roleId = idMap.getOptional('roles', record.roleId)
    const permissionId = permissionKeyToId.get(record.permissionKey)
    if (!roleId || !permissionId) continue
    data.push({ roleId, permissionId, congregationId })
  }

  if (data.length > 0) {
    await db.rolePermission.createMany({ data, skipDuplicates: true })
  }
}
