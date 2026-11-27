import { isSystemTemplate, ScheduleKind } from '~/features/events'
import { countMeetingsToMove } from '~/features/events/index.server'
import { scheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import { getTemplatePage } from '~/features/settings/server/template-page.queries'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * What a meeting type's side panel shows on « Types d’évènement » (6b-2b): its own fields, how many programmes use it,
 * its empty meetings ahead off its day or hours, the schedule templates it uses and those it may come to use (one of
 * each sort, 6b-2). Null for a type of another congregation.
 */
export async function getTypePanel(
  db: TransactionClient,
  templateId: number,
  context: { congregationId: number; timeZone: string },
) {
  const { congregationId, timeZone } = context
  const page = await getTemplatePage(db, templateId, congregationId)
  if (!page) return null
  const builtIn = isSystemTemplate(page.template.key)
  // Empty meetings ahead still on the type's old day or hours, which a manager may bring along.
  const meetingsToMove = builtIn
    ? 0
    : await countMeetingsToMove(db, templateId, { congregationId, timeZone, now: new Date() })
  // Each as « Modèles de planning » writes it; who holds a responsible role is that page's to say.
  const row = (each: (typeof page.allScheduleTemplates)[number]) => {
    const { id, title, detail, responsible, suggestedBy } = scheduleTemplateView(each, page.roles, new Map())
    return { id, title, detail, responsible, suggestedBy }
  }
  const schedules = page.scheduleTemplates.map(each => {
    const { suggestedBy: _, ...shown } = row(each)
    return shown
  })
  const usedSorts = new Set(page.scheduleTemplates.map(each => each.kind))
  const candidates =
    usedSorts.size < Object.values(ScheduleKind).length
      ? page.allScheduleTemplates.filter(each => !usedSorts.has(each.kind)).map(row)
      : null
  // What the panel reads of the type, and no more: its parts and services are « Modèles de planning »'s.
  const { name, key, color, weekDay, startTime, endTime, attendanceKind } = page.template
  return {
    id: templateId,
    template: { name, key, color, weekDay, startTime, endTime, attendanceKind },
    eventCount: page.eventCount,
    builtIn,
    meetingsToMove,
    schedules,
    candidates,
  }
}

export type TypePanelData = NonNullable<Awaited<ReturnType<typeof getTypePanel>>>
