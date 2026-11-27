import type { ServiceSchedule } from '~/features/display-board/model/programme-sheet.type'
import type { ProgrammeDynamicConfig } from '~/features/display-board/schemas/dynamic-config.schema'
import type { TransactionClient } from '~/shared/infra/db.server'

// A meeting may hold several duties schedules, one per template (user, 2026-11-27). A programme document shows the ones
// its settings choose for each meeting type (`dutyTemplates`; every one when it names none), each under its name.

/** The duties schedules of these meetings, by id: what the document titles a group of services with, and in what order. */
export async function programmeServiceSchedules(
  db: TransactionClient,
  eventIds: readonly number[],
  congregationId: number,
): Promise<Record<number, ServiceSchedule>> {
  if (eventIds.length === 0) return {}
  const rows = await db.schedule.findMany({
    where: { eventId: { in: [...eventIds] }, congregationId, kind: 'duty' },
    select: { id: true, name: true, order: true, scheduleTemplate: { select: { name: true } } },
  })
  return Object.fromEntries(
    rows.map(row => [row.id, { title: row.name ?? row.scheduleTemplate?.name ?? null, order: row.order }]),
  )
}

/**
 * The services of the duties schedules each meeting's type chooses (`dutyTemplates`), the others left out. A meeting
 * whose type names none keeps them all, as does a schedule made without a template: there is nothing to choose it by.
 */
export async function keepChosenServices<
  E extends { templateId: number | null; eventServiceParts?: { scheduleId: number | null }[] },
>(db: TransactionClient, events: E[], config: ProgrammeDynamicConfig, congregationId: number): Promise<E[]> {
  const chosen = new Map(config.templates.flatMap(t => (t.dutyTemplates ? [[t.templateId, t.dutyTemplates]] : [])))
  if (chosen.size === 0) return events
  const scheduleIds = [
    ...new Set(
      events.flatMap(event =>
        (event.eventServiceParts ?? []).flatMap(s => (s.scheduleId == null ? [] : [s.scheduleId])),
      ),
    ),
  ]
  const templateOf = new Map(
    (
      await db.schedule.findMany({
        where: { id: { in: scheduleIds }, congregationId },
        select: { id: true, scheduleTemplateId: true },
      })
    ).map(row => [row.id, row.scheduleTemplateId]),
  )
  return events.map(event => {
    const allowed = event.templateId == null ? undefined : chosen.get(event.templateId)
    if (allowed == null || event.eventServiceParts == null) return event
    const shows = (scheduleId: number | null) => {
      const template = scheduleId == null ? null : (templateOf.get(scheduleId) ?? null)
      return template == null || allowed.includes(template)
    }
    return { ...event, eventServiceParts: event.eventServiceParts.filter(service => shows(service.scheduleId)) }
  })
}

/**
 * A programme document's data with its duties schedules' titles (`serviceSchedules`), read beside the document's own
 * data so the screen, the sheet and the form's preview group its services alike. Other documents as they are.
 */
export async function withServiceSchedules<D extends { type: string; events?: { id: number }[] | null } | null>(
  db: TransactionClient,
  data: D,
  congregationId: number,
): Promise<D & { serviceSchedules?: Record<number, ServiceSchedule> }> {
  if (data == null || data.type !== 'programme' || data.events == null) return data as D & {}
  const serviceSchedules = await programmeServiceSchedules(
    db,
    data.events.map(event => event.id),
    congregationId,
  )
  return { ...data, serviceSchedules }
}

/**
 * Each meeting type's duties templates, in its order, by type id: what a programme document's settings let choose from
 * when a type uses several. A template without a name reads as « Services » (null).
 */
export async function kindDutyTemplates(
  db: TransactionClient,
  congregationId: number,
): Promise<Record<number, { id: number; title: string | null }[]>> {
  const links = await db.eventKindScheduleTemplate.findMany({
    where: { congregationId, scheduleTemplate: { kind: 'duty' } },
    select: { eventKindId: true, scheduleTemplate: { select: { id: true, name: true } } },
    orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
  })
  const byKind: Record<number, { id: number; title: string | null }[]> = {}
  for (const { eventKindId, scheduleTemplate } of links) {
    byKind[eventKindId] = [...(byKind[eventKindId] ?? []), { id: scheduleTemplate.id, title: scheduleTemplate.name }]
  }
  return byKind
}
