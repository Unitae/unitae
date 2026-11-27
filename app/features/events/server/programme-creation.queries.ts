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
      // Its rows not placed in a schedule template yet: a new meeting copies them too (kindTemplate).
      // biome-ignore lint/style/useNamingConvention: Prisma's relation count key
      _count: {
        select: {
          parts: { where: { scheduleTemplateId: null } },
          serviceParts: { where: { scheduleTemplateId: null } },
        },
      },
      scheduleTemplates: {
        select: {
          scheduleTemplate: {
            // biome-ignore lint/style/useNamingConvention: Prisma's relation count key
            select: { name: true, kind: true, _count: { select: { parts: true, serviceParts: true } } },
          },
        },
        // The same « first » as the copy and the counts (TEMPLATE_INCLUDE, TEMPLATE_PROGRAMME_COUNT).
        orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
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
      // What a new meeting copies (kindTemplate): the first template of each sort, and the kind's rows not placed.
      ...copiedBy(row),
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

/**
 * What « Créer » gives a new meeting of the kind, as kindTemplate copies it: its parts and services, its programme
 * schedule and one schedule per duties template (user, 2026-11-27) that has items (none empty), in the order the kind
 * lists its templates. The kind's own items not placed yet go with its first template of their sort.
 */
function copiedBy(row: {
  _count: { parts: number; serviceParts: number }
  scheduleTemplates: {
    scheduleTemplate: { name: string | null; kind: string; _count: { parts: number; serviceParts: number } }
  }[]
}) {
  const links = row.scheduleTemplates.map((link, at) => ({ at, ...link.scheduleTemplate }))
  const programme = links.find(link => link.kind === ScheduleKind.Programme)
  const duties = links
    .filter(link => link.kind === ScheduleKind.Duty)
    .map(link => ({ at: link.at, name: link.name, services: link._count.serviceParts }))
  // No duties template: the kind's own services still make one, unnamed.
  const dutySchedules = duties.length > 0 ? duties : [{ at: Number.MAX_SAFE_INTEGER, name: null, services: 0 }]
  const schedules = [
    {
      kind: ScheduleKind.Programme,
      at: programme?.at ?? Number.MAX_SAFE_INTEGER,
      name: programme?.name ?? null,
      items: (programme?._count.parts ?? 0) + row._count.parts,
    },
    ...dutySchedules.map((duty, index) => ({
      kind: ScheduleKind.Duty,
      at: duty.at,
      name: duty.name,
      items: duty.services + (index === 0 ? row._count.serviceParts : 0),
    })),
  ]
  return {
    parts: schedules[0]?.items ?? 0,
    services: schedules.slice(1).reduce((sum, schedule) => sum + schedule.items, 0),
    schedules: schedules
      .filter(schedule => schedule.items > 0)
      .sort((a, b) => a.at - b.at)
      .map(({ name, kind, items }) => ({ name, kind, items })),
  }
}
