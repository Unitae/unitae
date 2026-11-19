import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getConflictingAssignments } from '~/features/dashboard/server/dashboard.server'
import { getResponsibleConflicts } from '~/features/dashboard/server/get-responsible-conflicts.server'
import { listMyAbsences } from '~/features/events/server/days-off.queries'
import { createDayOff, deleteDayOff } from '~/features/events/server/days-off.server'
import {
  assignPart,
  assignServicePart,
  getEventProgramme,
  unassignPart,
  unassignServicePart,
} from '~/features/events/server/event-part-assignments.server'
import { fireReleaseNotifications, releaseEvent, unreleaseEvent } from '~/features/events/server/event-status.server'
import { bulkReleaseEvents, bulkUnreleaseEvents } from '~/features/events/server/event-status-bulk.server'
import { listUserConflictsInRange } from '~/features/events/server/list-user-conflicts-in-range.server'
import {
  type AssignmentDiff,
  buildAssignmentContext,
  dispatchAssignmentDiffs,
  partAssignmentDiffs,
  servicePartAssignmentDiffs,
} from '~/features/events/server/notify-assignment.server'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import {
  buildReferenceCongregation,
  deleteReferenceCongregation,
  labelOf,
  REFERENCE_NOW,
  REFERENCE_TIMEZONE,
  type ReferenceCongregation,
  referenceDb,
  withScope,
} from '~/tests/fixtures/events-reference'
import { compareText, reference, relabelLinks } from '~/tests/fixtures/reference-normalise'

// Assigning, unassigning, publishing and unpublishing, step by step, the way the routes chain the service functions:
// what each step returns, the conflict flags it leaves, every notice it queues — to whom, for what, with which link —
// and the notices unpublishing cancels. Also an absence declared on someone already on a published meeting, then
// removed. One test, because each step starts from the state the previous one left.

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

// A notice with no delay goes straight to the e-mail queue, never to the notices table: record what is queued there
// instead of reaching Redis, so instant notices are in the reference too.
interface InstantJob {
  notificationType: string
  recipientId: number | null
  payload: string
}
const instant = vi.hoisted((): InstantJob[] => [])
vi.mock('~/shared/infra/email-queue.server', () => ({
  emailQueue: {
    add: (_name: string, job: InstantJob) => {
      instant.push(job)
      return Promise.resolve()
    },
  },
}))

let fixture: ReferenceCongregation
let lastNoticeId = 0

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: REFERENCE_NOW })
  fixture = await buildReferenceCongregation(`assign-${randomUUID().slice(0, 8)}`)
  lastNoticeId = await latestNoticeId()
})

afterAll(async () => {
  vi.useRealTimers()
  if (fixture) await deleteReferenceCongregation(fixture.congregationId)
  await referenceDb.$disconnect()
})

const NOTIFY_CTX = { locale: 'fr', timezone: REFERENCE_TIMEZONE }

type Db = Parameters<Parameters<typeof withScope>[1]>[0]

function scoped<T>(fn: (db: Db) => Promise<T>) {
  return withScope(fixture.congregationId, fn)
}

async function latestNoticeId(): Promise<number> {
  const last = await scoped(db =>
    db.notificationEvent.findFirst({ where: { congregationId: fixture.congregationId }, orderBy: { id: 'desc' } }),
  )
  return last?.id ?? 0
}

function payloadOf(raw: string) {
  const payload = JSON.parse(raw) as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      typeof value === 'string' ? relabelLinks(value, fixture.labels) : value,
    ]),
  )
}

const ITEM_TABLES: Record<string, string> = { EventPart: 'eventPart', EventServicePart: 'eventServicePart' }

function entityOf(entityType: string, entityId: number): string {
  const table = ITEM_TABLES[entityType]
  if (!table) throw new Error(`a notice about an unexpected entity: ${entityType}`)
  return labelOf(fixture, table, entityId)
}

/**
 * Every notice queued since the last call: the delayed ones sorted by type, entity and recipient — release reads parts
 * and services with no ORDER BY, so they come in no defined order — then the instant ones in the order queued.
 */
async function newNotices() {
  const sent = instant.splice(0).map(job => ({
    type: job.notificationType,
    status: 'sent at once',
    recipient: job.recipientId == null ? null : labelOf(fixture, 'account', job.recipientId),
    payload: payloadOf(job.payload),
  }))
  const rows = await scoped(db =>
    db.notificationEvent.findMany({
      where: { congregationId: fixture.congregationId, id: { gt: lastNoticeId } },
      orderBy: { id: 'asc' },
    }),
  )
  if (rows.length > 0) lastNoticeId = rows[rows.length - 1].id
  const delayed = rows.map(row => ({
    type: row.type,
    status: row.status,
    entity: entityOf(row.entityType, row.entityId),
    recipient: row.recipientId == null ? null : labelOf(fixture, 'account', row.recipientId),
    payload: payloadOf(row.payload),
  }))
  const key = (notice: (typeof delayed)[number]) => `${notice.type} ${notice.entity} ${String(notice.recipient)}`
  return [...delayed.sort((a, b) => compareText(key(a), key(b))), ...sent]
}

/** The status of every notice so far, sorted: what unpublishing cancels shows here. */
async function noticeStatuses() {
  const rows = await scoped(db =>
    db.notificationEvent.findMany({ where: { congregationId: fixture.congregationId }, orderBy: { id: 'asc' } }),
  )
  return rows.map(row => `${row.type} ${entityOf(row.entityType, row.entityId)} → ${row.status}`).sort()
}

async function programme(name: string) {
  const event = await scoped(db => getEventProgramme(db, fixture.event(name), fixture.congregationId))
  if (!event) throw new Error(`no programme ${name}`)
  return event
}

async function partOf(name: string, order: number) {
  const part = (await programme(name)).eventParts.find(item => item.order === order)
  if (!part) throw new Error(`no part ${order} on ${name}`)
  return part
}

async function serviceOf(name: string, serviceName: string) {
  const service = (await programme(name)).eventServiceParts.find(item => item.name === serviceName)
  if (!service) throw new Error(`no service ${serviceName} on ${name}`)
  return service
}

async function dispatch(
  name: string,
  item: { entityType: 'EventPart' | 'EventServicePart'; id: number; name: string },
  diffs: AssignmentDiff[],
) {
  const { congregationId, adminId } = fixture
  await scoped(async db => {
    const event = await db.event.findFirstOrThrow({ where: { id: fixture.event(name), congregationId } })
    const ctx = buildAssignmentContext({
      event,
      assignmentName: item.name,
      entityType: item.entityType,
      entityId: item.id,
      congregationId,
      actorId: adminId,
      ...NOTIFY_CTX,
    })
    await dispatchAssignmentDiffs(db, ctx, diffs)
  })
}

/** Assigns a part's speaker as the assign route does — its assistant and external speaker kept — then notifies. */
async function assignPartLikeTheRoute(name: string, order: number, assigneeId: number | null) {
  const part = await partOf(name, order)
  const result = await scoped(db =>
    assignPart(db, part.id, assigneeId, part.assistantId, part.externalSpeakerId, part.topic, fixture.congregationId),
  )
  if ('error' in result) return result
  await dispatch(
    name,
    { entityType: 'EventPart', id: part.id, name: part.name },
    partAssignmentDiffs(
      { previousAssigneeId: result.previousAssigneeId, previousAssistantId: result.previousAssistantId },
      { assigneeId, assistantId: part.assistantId },
    ),
  )
  return { hasConflict: result.assignment.hasConflict }
}

async function assignServiceLikeTheRoute(name: string, serviceName: string, assigneeId: number | null) {
  const service = await serviceOf(name, serviceName)
  const result = await scoped(db => assignServicePart(db, service.id, assigneeId, fixture.congregationId))
  if ('error' in result) return result
  await dispatch(
    name,
    { entityType: 'EventServicePart', id: service.id, name: service.name },
    servicePartAssignmentDiffs({ previousAssigneeId: result.previousAssigneeId }, { assigneeId }),
  )
  return { hasConflict: result.assignment.hasConflict }
}

/** Removes a part's people as the remove route does, then notifies. */
async function unassignPartLikeTheRoute(name: string, order: number) {
  const part = await partOf(name, order)
  const result = await scoped(db => unassignPart(db, part.id, fixture.congregationId))
  if (!result) throw new Error(`could not unassign part ${order} of ${name}`)
  await dispatch(
    name,
    { entityType: 'EventPart', id: part.id, name: part.name },
    partAssignmentDiffs(
      { previousAssigneeId: result.previousAssigneeId, previousAssistantId: result.previousAssistantId },
      { assigneeId: null, assistantId: null },
    ),
  )
  return { removed: true }
}

async function unassignServiceLikeTheRoute(name: string, serviceName: string) {
  const service = await serviceOf(name, serviceName)
  const result = await scoped(db => unassignServicePart(db, service.id, fixture.congregationId))
  if (!result) throw new Error(`could not unassign ${serviceName} on ${name}`)
  await dispatch(
    name,
    { entityType: 'EventServicePart', id: service.id, name: service.name },
    servicePartAssignmentDiffs({ previousAssigneeId: result.previousAssigneeId }, { assigneeId: null }),
  )
  return { removed: true }
}

/** Publishes as the route does: the release, then its notices outside the transaction. */
async function publishLikeTheRoute(name: string) {
  const { congregationId, adminId } = fixture
  const result = await scoped(db => releaseEvent(db, fixture.event(name), congregationId, adminId))
  if (!result) throw new Error(`no event ${name} to publish`)
  if ('error' in result) return result
  await fireReleaseNotifications(result.event, result.notifyTargets, congregationId, adminId, NOTIFY_CTX)
  return { status: result.event.status, notified: result.notifyTargets.length }
}

async function unpublish(name: string) {
  const { congregationId, adminId } = fixture
  const result = await scoped(db => unreleaseEvent(db, fixture.event(name), congregationId, adminId))
  if (!result) throw new Error(`no event ${name} to unpublish`)
  return { status: result.event.status }
}

/** What someone with an absence reads, and what whoever answers for the meetings reads. */
function conflictViews(person: string) {
  const { congregationId } = fixture
  return scoped(async db => ({
    dashboardConflict: await getConflictingAssignments(db, fixture.member(person)),
    myAbsences: await listMyAbsences(db, {
      accountId: fixture.account(person),
      memberId: fixture.member(person),
      congregationId,
      now: REFERENCE_NOW,
    }),
    conflictsInRange: await listUserConflictsInRange(
      db,
      fixture.member(person),
      combineLocalDateTime('2027-03-08', '00:00', REFERENCE_TIMEZONE),
      combineLocalDateTime('2027-03-28', '23:59', REFERENCE_TIMEZONE),
    ),
    responsibleConflictsOfPaul: await getResponsibleConflicts(db, fixture.account('paul'), congregationId, false),
    responsibleConflictsOfAManager: await getResponsibleConflicts(db, fixture.adminId, congregationId, true),
  }))
}

async function declareAbsence(person: string, first: string, last: string): Promise<number> {
  const absence = await scoped(db =>
    createDayOff(
      db,
      fixture.account(person),
      fixture.member(person),
      combineLocalDateTime(first, '00:00', REFERENCE_TIMEZONE),
      combineLocalDateTime(last, '23:59', REFERENCE_TIMEZONE),
      fixture.congregationId,
    ),
  )
  if (!absence) throw new Error(`could not declare ${person}’s absence`)
  fixture.labels.set(`event:${absence.eventId}`, `absence-${person}`)
  // An absence is deleted by its row.
  return absence.absenceId
}

function flags(event: Awaited<ReturnType<typeof programme>>) {
  return {
    status: event.status,
    parts: event.eventParts.map(part => `${part.order} ${part.hasConflict ? 'conflict' : 'clear'}`),
    services: event.eventServiceParts.map(service => `${service.name} ${service.hasConflict ? 'conflict' : 'clear'}`),
  }
}

describe('assignments, publishing and their notices', () => {
  it('match the reference, step by step', async () => {
    const journal: { step: string; result: unknown; notices: unknown }[] = []
    const step = async (name: string, action: () => Promise<unknown>) => {
      const result = await action()
      journal.push({ step: name, result, notices: await newNotices() })
      return result
    }
    const { member, event } = fixture

    // A draft with an absent publisher on it: flagged, and publishing it is refused.
    const left = await programme('midweek-2')
    expect(left.eventParts.some(part => part.hasConflict)).toBe(true)
    journal.push({
      step: 'the second midweek meeting as the fixture left it, Hugo on his absence',
      result: left,
      notices: [],
    })
    const refused = await step('publish it while Hugo is on it', () => publishLikeTheRoute('midweek-2'))
    expect(refused).toMatchObject({ reason: 'conflicts' })

    // Changes on a draft notify nobody.
    for (const part of (await programme('midweek-2')).eventParts.filter(item => item.hasConflict)) {
      const result = await assignPartLikeTheRoute('midweek-2', part.order, member('pierre'))
      if ('error' in result) throw new Error(`could not move part ${part.order}: ${result.error}`)
    }
    for (const service of (await programme('midweek-2')).eventServiceParts.filter(item => item.hasConflict)) {
      const result = await assignServiceLikeTheRoute('midweek-2', service.name, member('luc'))
      if ('error' in result) throw new Error(`could not move ${service.name}: ${result.error}`)
    }
    await step('Hugo’s parts and services moved on the draft', async () => flags(await programme('midweek-2')))

    await step('publish the second midweek meeting', () => publishLikeTheRoute('midweek-2'))

    // Refusals on published and restricted parts.
    await step('put Hugo, away that week, on part 3 of the published second midweek meeting', () =>
      assignPartLikeTheRoute('midweek-2', 3, member('hugo')),
    )
    await step('put Hugo on the elders-only talk of the third midweek meeting, a draft', () =>
      assignPartLikeTheRoute('midweek-3', 2, member('hugo')),
    )

    // Changes on a published meeting notify whoever gains or loses a slot.
    await step('give the first weekend sound to Marc instead of Luc', () =>
      assignServiceLikeTheRoute('weekend-1', 'Audio-vidéo', member('marc')),
    )
    await step('take the opening part of the first midweek meeting from Paul', () =>
      assignPartLikeTheRoute('midweek-1', 1, null),
    )
    await step('remove the closing part of the first midweek meeting, its speaker and its reader', async () => {
      const closing = (await programme('midweek-1')).eventParts.at(-1)
      if (!closing) throw new Error('the first midweek meeting has no part')
      return unassignPartLikeTheRoute('midweek-1', closing.order)
    })
    await step('remove the first midweek meeting’s stage', () => unassignServiceLikeTheRoute('midweek-1', 'Estrade'))
    await step('assign a part of the third midweek meeting, a draft', () =>
      assignPartLikeTheRoute('midweek-3', 1, member('jean')),
    )

    // An absence declared over a published meeting someone is already on, then removed.
    let pierreAbsence = 0
    await step('Pierre declares an absence over the published second midweek meeting', async () => {
      pierreAbsence = await declareAbsence('pierre', '2027-03-16', '2027-03-16')
      return flags(await programme('midweek-2'))
    })
    await step('what Pierre and the responsibles read with that absence', () => conflictViews('pierre'))
    await step('Pierre removes his absence', async () => {
      const removed = await scoped(db =>
        deleteDayOff(db, {
          absenceId: pierreAbsence,
          accountId: fixture.account('pierre'),
          memberId: member('pierre'),
          congregationId: fixture.congregationId,
        }),
      )
      if (!removed) throw new Error('could not remove Pierre’s absence')
      return flags(await programme('midweek-2'))
    })
    await step('what Pierre and the responsibles read once it is gone', () => conflictViews('pierre'))

    // Unpublishing cancels the notices still waiting.
    await step('unpublish the second midweek meeting', () => unpublish('midweek-2'))
    journal.push({ step: 'every notice so far', result: await noticeStatuses(), notices: [] })

    // Bulk: published ones, one blocked by an absence, one waiting for its programme.
    await declareAbsence('jean', '2027-03-23', '2027-03-23')
    await step('bulk publish', async () => {
      const names = ['weekend-1', 'midweek-3', 'weekend-3', 'memorial-1', 'midweek-ahead-1']
      const result = await bulkReleaseEvents(
        names.map(name => event(name)),
        fixture.congregationId,
        fixture.adminId,
        NOTIFY_CTX,
      )
      const label = (id: number) => labelOf(fixture, 'event', id)
      return {
        released: result.released.map(label),
        blocked: result.blocked.map(item => ({ event: label(item.id), error: item.error })),
        awaiting: result.awaiting.map(label),
      }
    })
    await step('bulk unpublish', async () => {
      const result = await bulkUnreleaseEvents(
        [event('weekend-3'), event('memorial-1')],
        fixture.congregationId,
        fixture.adminId,
      )
      return {
        unreleased: result.unreleased.map(id => labelOf(fixture, 'event', id)),
        notFound: result.notFound,
        failed: result.failed,
      }
    })
    journal.push({ step: 'every notice at the end', result: await noticeStatuses(), notices: [] })

    await expect(reference(journal, fixture.labels)).toMatchFileSnapshot('./__references__/assignments.json')
  })
})
