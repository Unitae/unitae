import { SYSTEM_TEMPLATE_KEYS } from '~/features/events/model/event-template.type'
import type { CreationTemplate, ExistingProgramme } from '~/features/events/model/programme-creation'
import { getLocale } from '~/i18n/paraglide/runtime'
import type { TransactionClient } from '~/shared/infra/db.server'
import { dayOf, startOfDay } from '~/shared/utils/calendar-day'

export interface ProgrammeCreationData {
  templates: CreationTemplate[]
  existing: ExistingProgramme[]
}

/**
 * What the creation page needs: the templates programmes can be created from (all of them, or `templateIds` for
 * someone responsible for a few), each with the day of its latest programme, and the programmes to come of those
 * templates, so that the page can say which days already have theirs. Never the absence or freeform templates.
 */
export async function getProgrammeCreationData(
  db: TransactionClient,
  input: { congregationId: number; timezone: string; today: string; templateIds: number[] | null },
): Promise<ProgrammeCreationData> {
  const { congregationId, timezone } = input
  const rows = await db.eventTemplate.findMany({
    where: {
      congregationId,
      key: { notIn: [...SYSTEM_TEMPLATE_KEYS] },
      ...(input.templateIds == null ? {} : { id: { in: input.templateIds } }),
    },
    select: {
      id: true,
      name: true,
      color: true,
      weekDay: true,
      startTime: true,
      endTime: true,
      // biome-ignore lint/style/useNamingConvention: Prisma's relation count key
      _count: { select: { parts: true, serviceParts: true } },
    },
  })
  if (rows.length === 0) return { templates: [], existing: [] }

  const ids = rows.map(row => row.id)
  const [latest, upcoming] = await Promise.all([
    db.event.groupBy({
      by: ['templateId'],
      where: { congregationId, templateId: { in: ids } },
      // biome-ignore lint/style/useNamingConvention: Prisma's aggregate key
      _max: { startDate: true },
    }),
    db.event.findMany({
      where: { congregationId, templateId: { in: ids }, startDate: { gte: startOfDay(input.today, timezone) } },
      select: { id: true, templateId: true, startDate: true },
    }),
  ])
  const lastDays = new Map(
    latest.flatMap(row =>
      row.templateId == null || row._max.startDate == null
        ? []
        : [[row.templateId, dayOf(row._max.startDate, timezone)]],
    ),
  )

  const templates = rows
    .map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      weekDay: row.weekDay,
      startTime: row.startTime,
      endTime: row.endTime,
      parts: row._count.parts,
      services: row._count.serviceParts,
      lastDay: lastDays.get(row.id) ?? null,
    }))
    .sort(byWeekThenName)
  const existing = upcoming.flatMap(event =>
    event.templateId == null
      ? []
      : [{ templateId: event.templateId, day: dayOf(event.startDate, timezone), eventId: event.id }],
  )
  return { templates, existing }
}

/** Monday first, as the weeks of the programmes list; templates without a day of their own last. */
function weekPosition(weekDay: number | null): number {
  return weekDay == null ? 7 : (weekDay + 6) % 7
}

function byWeekThenName(a: CreationTemplate, b: CreationTemplate): number {
  return weekPosition(a.weekDay) - weekPosition(b.weekDay) || a.name.localeCompare(b.name, getLocale())
}
