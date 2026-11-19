import type JsZip from 'jszip'
import {
  type AttendanceKind,
  defaultAttendanceKind,
  EventTemplateKey,
  isAttendanceKind,
  RESPONSIBILITY_SCOPES,
  ResponsibilityScope,
} from '~/features/events'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { EntityIdMap } from './data-transfer.type'
import { fallbackServiceOrders, readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-event-templates')

/**
 * The attendance kind an archived template carries, or null when it says nothing usable: absent (before 2.15), or a
 * kind this version does not know — then an existing template keeps its own and a new one gets its key's default,
 * never a silent « not counted ».
 */
function archivedKind(value: string | undefined, key: string, congregationId: number): AttendanceKind | null {
  if (value == null) return null
  if (isAttendanceKind(value)) return value
  logger.warn(`Unknown attendance kind "${value}" on template "${key}": kept the template's own or its default`, {
    congregationId,
  })
  return null
}

/** The template's hours when the archive carries them; an older archive leaves them as they are. */
function hours(record: { startTime?: string; endTime?: string }) {
  return {
    ...(record.startTime != null ? { startTime: record.startTime } : {}),
    ...(record.endTime != null ? { endTime: record.endTime } : {}),
  }
}

export async function importEventTemplates(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    key: string
    description: string
    weekDay: number | null
    isRecurring: boolean
    color?: string
    /** From archive 2.15 on. */
    attendanceKind?: string
    /** From archive 2.16 on. An older archive has none: an existing template keeps its hours, a new one the default. */
    startTime?: string
    endTime?: string
  }>(zip, 'programme-templates')

  for (const record of records) {
    // An archive from before the day-off events were dropped has their template: it is not restored, and its events
    // come back as absences only (importEvents).
    if (record.key === EventTemplateKey.DayOff) continue
    const kind = archivedKind(record.attendanceKind, record.key, congregationId)
    const existing = await db.eventTemplate.findFirst({ where: { key: record.key, congregationId } })
    if (existing) {
      await db.eventTemplate.update({
        where: { id_congregationId: { id: existing.id, congregationId } },
        data: {
          name: record.name,
          description: record.description,
          weekDay: record.weekDay,
          isRecurring: record.isRecurring,
          ...(record.color != null ? { color: record.color } : {}),
          ...hours(record),
          // An archive from before attendance says nothing: the template keeps how it counts here.
          ...(kind != null ? { attendanceKind: kind } : {}),
        },
      })
      idMap.set('programme-templates', record.id, existing.id)
    } else {
      const created = await db.eventTemplate.create({
        data: {
          name: record.name,
          key: record.key,
          description: record.description,
          weekDay: record.weekDay,
          isRecurring: record.isRecurring,
          ...(record.color != null ? { color: record.color } : {}),
          ...hours(record),
          // Same default as the migration gave existing templates.
          attendanceKind: kind ?? defaultAttendanceKind(record.key),
          congregationId,
        },
      })
      idMap.set('programme-templates', record.id, created.id)
    }
  }
}

export async function importTemplateParts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    templateId: number
    presetId?: number | null
  }>(zip, 'programme-template-parts')

  for (const record of records) {
    const templateId = idMap.getOptional('programme-templates', record.templateId)
    if (!templateId) continue

    const created = await db.templatePart.create({
      data: {
        name: record.name,
        section: record.section,
        track: record.track,
        trackOrder: record.trackOrder ?? null,
        order: record.order,
        durationMin: record.durationMin,
        allowExternalSpeaker: record.allowExternalSpeaker,
        templateId,
        // Absent in pre-2.5 archives, which resolves to null.
        presetId: idMap.getOptional('part-presets', record.presetId),
        congregationId,
      },
    })
    idMap.set('programme-template-parts', record.id, created.id)
  }
}

export async function importTemplateServiceParts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    key: string
    templateId: number
    presetId?: number | null
    order?: number
  }>(zip, 'programme-template-service-roles')

  const fallback = fallbackServiceOrders(records, record => record.templateId)
  for (const record of records) {
    const templateId = idMap.getOptional('programme-templates', record.templateId)
    if (!templateId) continue

    const created = await db.templateServicePart.create({
      data: {
        name: record.name,
        key: record.key,
        order: record.order ?? fallback.get(record.id) ?? 0,
        templateId,
        presetId: idMap.getOptional('part-presets', record.presetId),
        congregationId,
      },
    })
    idMap.set('programme-template-service-roles', record.id, created.id)
  }
}

export async function importTemplateResponsibles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    templateId: number
    roleId?: number
    userId?: number
    scope?: string
  }>(zip, 'programme-template-responsibles')

  // Pre-2.7 archives name a UserAccount instead of a role. There is no safe mapping back —
  // picking a role that user happens to hold would silently widen the delegation to everyone
  // else in it — so those rows are dropped and counted, the same way v2.5 preset-level
  // eligibility was. The file is still read so its presence never fails the import.
  let skippedLegacy = 0

  for (const record of records) {
    const templateId = idMap.getOptional('programme-templates', record.templateId)
    if (!templateId) continue

    if (record.roleId == null) {
      skippedLegacy += 1
      continue
    }

    const roleId = idMap.getOptional('roles', record.roleId)
    if (!roleId) continue

    // Pre-2.8 archives have no scope: their single row is the whole-event
    // delegation, which is exactly what 'programme' means. An unrecognised value
    // would fail the CHECK constraint mid-import, so it is normalised here.
    const scope = RESPONSIBILITY_SCOPES.find(s => s === record.scope) ?? ResponsibilityScope.Programme

    await db.templateResponsible.create({
      data: { templateId, roleId, scope, congregationId },
    })
  }

  if (skippedLegacy > 0) {
    logger.info(
      `Skipped ${skippedLegacy} pre-2.7 template responsible row(s): they name a user, not a role. Re-assign them in the template settings.`,
    )
  }
}

export async function importTemplatePartAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ partId: number; roleId: number; asKind: string }>(
    zip,
    'programme-template-part-allowed-roles',
  )
  const data: { partId: number; roleId: number; asKind: string; congregationId: number }[] = []

  for (const record of records) {
    const partId = idMap.getOptional('programme-template-parts', record.partId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!partId || !roleId) continue
    data.push({ partId, roleId, asKind: record.asKind, congregationId })
  }

  if (data.length > 0) {
    await db.templatePartAllowedRole.createMany({ data, skipDuplicates: true })
  }
}

export async function importTemplateServicePartAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ servicePartId: number; roleId: number }>(
    zip,
    'programme-template-service-role-allowed-roles',
  )
  const data: { servicePartId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const servicePartId = idMap.getOptional('programme-template-service-roles', record.servicePartId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!servicePartId || !roleId) continue
    data.push({ servicePartId, roleId, congregationId })
  }

  if (data.length > 0) {
    await db.templateServicePartAllowedRole.createMany({ data, skipDuplicates: true })
  }
}
