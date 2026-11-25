import { ScheduleKind } from '~/features/events/model/schedule.type'
import type { TransactionClient } from '~/shared/infra/db.server'

/** A schedule template as Réglages › « Modèles de planning » lists it. */
export interface ScheduleTemplateSetting {
  id: number
  name: string | null
  /** Labels an unnamed template (its kind's label in the reader's language). */
  key: string | null
  kind: string
  /** Its parts (a programme) or its duties. */
  items: number
  responsibleRole: { id: number; key: string; name: string | null } | null
  /** The kinds suggesting it, in their order. */
  kinds: { id: number; name: string }[]
  /** The schedules made from it. */
  schedules: number
  /** Its rooms, the main room included (a programme's; none for duties). */
  rooms: number
}

/** Every schedule template of the congregation, for its page in Réglages. */
export async function listScheduleTemplatesForSettings(
  db: TransactionClient,
  congregationId: number,
): Promise<ScheduleTemplateSetting[]> {
  const rows = await db.scheduleTemplate.findMany({
    where: { congregationId },
    select: {
      id: true,
      name: true,
      key: true,
      kind: true,
      responsibleRole: { select: { id: true, key: true, name: true } },
      eventKinds: {
        select: { eventKind: { select: { id: true, name: true } } },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      },
      // biome-ignore lint/style/useNamingConvention: Prisma's relation count key
      _count: { select: { parts: true, serviceParts: true, schedules: true, rooms: true } },
    },
    orderBy: [{ kind: 'desc' }, { id: 'asc' }],
  })
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    key: row.key,
    kind: row.kind,
    items: row.kind === ScheduleKind.Programme ? row._count.parts : row._count.serviceParts,
    responsibleRole: row.responsibleRole,
    kinds: row.eventKinds.map(link => link.eventKind),
    schedules: row._count.schedules,
    rooms: row._count.rooms,
  }))
}
