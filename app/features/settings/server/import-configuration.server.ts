import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

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
  }>(zip, 'roles')

  for (const record of records) {
    const existing = await db.role.findFirst({ where: { key: record.key, congregationId } })
    if (existing) {
      // Built-in roles are pre-seeded for every congregation; map source id to existing target id.
      // Custom roles imported into a congregation that already has the same key get their
      // metadata refreshed but keep the target's id.
      await db.role.update({
        where: { id_congregationId: { id: existing.id, congregationId } },
        data: { name: record.name, description: record.description, isBuiltIn: record.isBuiltIn },
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
        },
      })
      idMap.set('roles', record.id, created.id)
    }
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
