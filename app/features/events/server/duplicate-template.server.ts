import { isSystemTemplate } from '~/features/events/model/event-template.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function duplicateTemplate(db: TransactionClient, templateId: number, congregationId: number) {
  const source = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { allowedRoles: true },
      },
      serviceParts: { include: { allowedRoles: true } },
    },
  })
  if (!source) return null

  // System templates are looked up by key at runtime — duplicating them just
  // clutters the list with an untethered `-copy-<ts>` row. The UI hides the
  // Duplicate button; this is the server-side match.
  if (isSystemTemplate(source.key)) return null

  const duplicated = await db.eventTemplate.create({
    data: {
      name: `${source.name} (copie)`,
      key: `${source.key}-copy-${Date.now()}`,
      description: source.description,
      weekDay: source.weekDay,
      isRecurring: source.isRecurring,
      startTime: source.startTime,
      endTime: source.endTime,
      congregationId,
      parts: {
        create: source.parts.map(part => ({
          name: part.name,
          section: part.section,
          track: part.track,
          trackOrder: part.trackOrder,
          order: part.order,
          durationMin: part.durationMin,
          allowExternalSpeaker: part.allowExternalSpeaker,
          speakerLabel: part.speakerLabel,
          readerLabel: part.readerLabel,
          // The kind travels with the part. Without it the copy keeps the
          // name but loses its share message, slot labels and
          // external-speaker rule, and looks unclassified everywhere.
          presetId: part.presetId,
          congregationId,
        })),
      },
      serviceParts: {
        create: source.serviceParts.map(role => ({
          name: role.name,
          key: `${role.key}-copy-${Date.now()}`,
          congregationId,
        })),
      },
    },
    include: {
      parts: { orderBy: { order: 'asc' } },
      serviceParts: { orderBy: { name: 'asc' } },
    },
  })

  const sourcePartsByOrder = new Map(source.parts.map(p => [p.order, p]))
  const sourceServicePartsByName = new Map(source.serviceParts.map(r => [r.name, r]))

  for (const newPart of duplicated.parts) {
    const sourcePart = sourcePartsByOrder.get(newPart.order)
    if (!sourcePart) continue
    const speakerRoleIds = sourcePart.allowedRoles.filter(r => r.asKind === 'speaker').map(r => r.roleId)
    const readerRoleIds = sourcePart.allowedRoles.filter(r => r.asKind === 'reader').map(r => r.roleId)
    if (speakerRoleIds.length > 0) {
      await db.templatePartAllowedRole.createMany({
        data: speakerRoleIds.map(roleId => ({ partId: newPart.id, roleId, asKind: 'speaker', congregationId })),
        skipDuplicates: true,
      })
    }
    if (readerRoleIds.length > 0) {
      await db.templatePartAllowedRole.createMany({
        data: readerRoleIds.map(roleId => ({ partId: newPart.id, roleId, asKind: 'reader', congregationId })),
        skipDuplicates: true,
      })
    }
  }

  for (const newRole of duplicated.serviceParts) {
    const sourceRole = sourceServicePartsByName.get(newRole.name)
    if (!sourceRole || sourceRole.allowedRoles.length === 0) continue
    await db.templateServicePartAllowedRole.createMany({
      data: sourceRole.allowedRoles.map(r => ({ servicePartId: newRole.id, roleId: r.roleId, congregationId })),
      skipDuplicates: true,
    })
  }

  return duplicated
}
