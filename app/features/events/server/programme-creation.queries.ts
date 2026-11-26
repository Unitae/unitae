import { EventOrigin } from '~/features/events/model/event-origin.type'
import { SYSTEM_TEMPLATE_KEYS } from '~/features/events/model/event-template.type'
import type { CreationTemplate, ExistingProgramme } from '~/features/events/model/programme-creation'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { getLocale } from '~/i18n/paraglide/runtime'
import type { TransactionClient } from '~/shared/infra/db.server'
import { dayOf, startOfDay } from '~/shared/utils/calendar-day'

export interface ProgrammeCreationData {
  templates: CreationTemplate[]
  existing: ExistingProgramme[]
  /** Meetings to come created ahead without a programme: a series fills them rather than creating others. */
  ahead: ExistingProgramme[]
}

/**
 * What the creation page needs: the templates programmes can be created from (all of them, or `templateIds` for
 * someone responsible for a few), each with the day of its latest programme, and the programmes to come of those
 * templates, so that the page can say which days already have theirs. Never the freeform template.
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
      scheduleTemplates: {
        select: {
          scheduleTemplate: {
            // biome-ignore lint/style/useNamingConvention: Prisma's relation count key
            select: { name: true, kind: true, _count: { select: { parts: true, serviceParts: true } } },
          },
        },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      },
    },
  })
  if (rows.length === 0) return { templates: [], existing: [], ahead: [] }

  const ids = rows.map(row => row.id)
  // Only events with a programme: a meeting the recurring-events job created ahead is a day still to prepare, which
  // the series fills rather than starting after it.
  const hasProgramme = { items: { some: {} } }
  const toCome = { congregationId, templateId: { in: ids }, startDate: { gte: startOfDay(input.today, timezone) } }
  const [latest, upcoming, waiting] = await Promise.all([
    db.event.groupBy({
      by: ['templateId'],
      where: { congregationId, templateId: { in: ids }, ...hasProgramme },
      // biome-ignore lint/style/useNamingConvention: Prisma's aggregate key
      _max: { startDate: true },
    }),
    db.event.findMany({
      where: { ...toCome, ...hasProgramme },
      select: { id: true, templateId: true, startDate: true },
    }),
    db.event.findMany({
      where: { ...toCome, items: { none: {} } },
      select: { id: true, templateId: true, startDate: true, origin: true, attendance: { select: { id: true } } },
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
      // The kind's items: those of the schedule templates it uses (6b-0).
      parts: countOf(row.scheduleTemplates, 'parts'),
      services: countOf(row.scheduleTemplates, 'serviceParts'),
      // What giveProgramme creates: one schedule of each kind with items, none empty, from the templates it uses.
      schedules: row.scheduleTemplates.flatMap(({ scheduleTemplate: { name, kind, _count } }) => {
        const items = kind === ScheduleKind.Programme ? _count.parts : _count.serviceParts
        return items > 0 ? [{ name, kind, items }] : []
      }),
      lastDay: lastDays.get(row.id) ?? null,
    }))
    .sort(byWeekThenName)
  const onDays = (events: { id: number; templateId: number | null; startDate: Date }[]) =>
    events.flatMap(event =>
      event.templateId == null
        ? []
        : [{ templateId: event.templateId, day: dayOf(event.startDate, timezone), eventId: event.id }],
    )
  // A passed day removes only the job's empty meeting (EMPTY_MEETING): the row says so only for that one.
  const ahead = onDays(waiting).map((event, index) => ({
    ...event,
    removable: waiting[index]?.origin === EventOrigin.Job && waiting[index]?.attendance == null,
  }))
  return { templates, existing: onDays(upcoming), ahead }
}

/** Monday first, as the weeks of the programmes list; templates without a day of their own last. */
function weekPosition(weekDay: number | null): number {
  return weekDay == null ? 7 : (weekDay + 6) % 7
}

function byWeekThenName(a: CreationTemplate, b: CreationTemplate): number {
  return weekPosition(a.weekDay) - weekPosition(b.weekDay) || a.name.localeCompare(b.name, getLocale())
}

/** How many parts or services the schedule templates a kind uses hold together. */
function countOf(
  links: { scheduleTemplate: { _count: { parts: number; serviceParts: number } } }[],
  of: 'parts' | 'serviceParts',
) {
  return links.reduce((total, link) => total + link.scheduleTemplate._count[of], 0)
}
