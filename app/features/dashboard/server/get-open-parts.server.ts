import { ScheduleKind, ScheduleStatus } from '~/features/events'
import { PART_ITEMS } from '~/features/events/index.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'

const DAY_MS = 24 * 60 * 60 * 1000

/** A coming meeting with slots nobody holds yet. */
export interface OpenSlots {
  eventId: number
  name: string
  startDate: Date
  /** Drafts count too: that is where slots get filled before release. */
  isDraft: boolean
  count: number
}

/**
 * Coming meetings, within `days`, that still have parts with neither an assignee nor a visiting speaker. `roleIds`
 * narrows to the parts whose programme the viewer answers for, through the role its schedule's template names (plan
 * §10); null means all of them (someone who may fill any schedule).
 */
export async function getOpenParts(
  db: TransactionClient,
  congregationId: number,
  { roleIds, days, now = new Date() }: { roleIds: readonly number[] | null; days: number; now?: Date },
): Promise<OpenSlots[]> {
  if (roleIds != null && roleIds.length === 0) return []
  const answered =
    roleIds == null ? [] : [{ schedule: { scheduleTemplate: { responsibleRoleId: { in: [...roleIds] } } } }]
  // An open slot is a room nobody holds (parallel rooms): a part held in two rooms has two. Read with its rows, as a
  // part with a row per room has its rooms nowhere else.
  const openRoom = { assigneeId: null, externalSpeakerId: null }
  const parts = { AND: [...PART_ITEMS.AND, ...answered], rooms: { some: openRoom } }
  const events = await db.event.findMany({
    where: {
      congregationId,
      startDate: { gte: now, lt: new Date(now.getTime() + days * DAY_MS) },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      // The open slots are programme parts: the programme's own schedule says whether it is a draft (plan §10, 5b).
      schedules: { where: { kind: ScheduleKind.Programme }, select: { status: true } },
      items: { where: parts, select: { rooms: { where: openRoom, select: { id: true } } } },
    },
    orderBy: { startDate: 'asc' },
  })
  return events
    .map(event => ({ event, count: event.items.reduce((sum, item) => sum + item.rooms.length, 0) }))
    .filter(({ count }) => count > 0)
    .map(({ event, count }) => ({
      eventId: event.id,
      name: event.name,
      startDate: event.startDate,
      isDraft: event.schedules[0]?.status !== ScheduleStatus.Published,
      count,
    }))
}

/**
 * The roles the caller holds that some programme schedule template names as its responsible: what a reader who fills
 * no schedule wholesale answers for, the open parts going by them. None means they answer for no programme.
 */
export async function programmeResponsibleRoleIds(
  db: TransactionClient,
  userId: number,
  congregationId: number,
): Promise<number[]> {
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return []
  const templates = await db.scheduleTemplate.findMany({
    where: { congregationId, kind: 'programme', responsibleRoleId: { in: roleIds } },
    select: { responsibleRoleId: true },
  })
  return [
    ...new Set(templates.flatMap(template => (template.responsibleRoleId == null ? [] : [template.responsibleRoleId]))),
  ]
}
