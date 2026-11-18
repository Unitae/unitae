import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  assignPart,
  assignServicePart,
  getEventProgramme,
} from '~/features/events/server/event-part-assignments.server'
import { fireReleaseNotifications, releaseEvent, unreleaseEvent } from '~/features/events/server/event-status.server'
import { bulkReleaseEvents, bulkUnreleaseEvents } from '~/features/events/server/event-status-bulk.server'
import {
  buildAssignmentContext,
  dispatchAssignmentDiffs,
  partAssignmentDiffs,
  servicePartAssignmentDiffs,
} from '~/features/events/server/notify-assignment.server'
import {
  buildReferenceCongregation,
  deleteReferenceCongregation,
  itemLabels,
  REFERENCE_NOW,
  REFERENCE_TIMEZONE,
  type ReferenceCongregation,
  referenceDb,
  withScope,
} from '~/tests/fixtures/events-reference'
import { reference, relabelLinks } from '~/tests/fixtures/reference-normalise'

// Assigning, unassigning, publishing and unpublishing, step by step, the way the routes chain the service functions:
// what each step returns, the conflict flags it leaves, and every notice it queues — to whom, for what, with which
// link. The schedules refactor must keep every line of these references.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 })

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

async function latestNoticeId(): Promise<number> {
  const last = await withScope(fixture.congregationId, db =>
    db.notificationEvent.findFirst({ where: { congregationId: fixture.congregationId }, orderBy: { id: 'desc' } }),
  )
  return last?.id ?? 0
}

function eventLabel(id: number): string {
  return fixture.labels.get(`event:${id}`) ?? `event-?`
}

function linkLabel(link: unknown): unknown {
  return typeof link === 'string' ? relabelLinks(link, fixture.labels) : link
}

/** Every notice queued since the last call, in the order queued: delayed ones first, then instant ones. */
async function newNotices() {
  const items = await itemLabels(fixture)
  const sent = instant.splice(0).map(job => {
    const payload = JSON.parse(job.payload) as Record<string, unknown>
    return {
      type: job.notificationType,
      status: 'sent at once',
      recipient: fixture.labels.get(`account:${job.recipientId}`) ?? job.recipientId,
      payload: Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, linkLabel(value)])),
    }
  })
  const rows = await withScope(fixture.congregationId, db =>
    db.notificationEvent.findMany({
      where: { congregationId: fixture.congregationId, id: { gt: lastNoticeId } },
      orderBy: { id: 'asc' },
    }),
  )
  if (rows.length > 0) lastNoticeId = rows[rows.length - 1].id
  const delayed = rows.map(row => {
    const payload = JSON.parse(row.payload) as Record<string, unknown>
    return {
      type: row.type,
      status: row.status,
      entity: items.get(`${row.entityType}:${row.entityId}`) ?? `${row.entityType}:?`,
      recipient: fixture.labels.get(`account:${row.recipientId}`) ?? row.recipientId,
      payload: Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, linkLabel(value)])),
    }
  })
  // Release notices follow the services in the order the database returns them, which is not defined: sorted here.
  const key = (notice: { type: string; recipient: unknown; payload: Record<string, unknown> }) =>
    `${notice.type} ${String(notice.payload.assignmentName)} ${String(notice.recipient)}`
  return [...delayed.sort((a, b) => key(a).localeCompare(key(b))), ...sent]
}

/** The statuses of every notice so far, by entity: what unpublishing cancels. */
async function noticeStatuses() {
  const items = await itemLabels(fixture)
  const rows = await withScope(fixture.congregationId, db =>
    db.notificationEvent.findMany({ where: { congregationId: fixture.congregationId }, orderBy: { id: 'asc' } }),
  )
  // Sorted: notices queued in one release come in the services' undefined order.
  return rows.map(row => `${row.type} ${items.get(`${row.entityType}:${row.entityId}`)} → ${row.status}`).sort()
}

function programme(name: string) {
  return withScope(fixture.congregationId, db => getEventProgramme(db, fixture.events[name], fixture.congregationId))
}

async function partOf(name: string, order: number) {
  const parts = (await programme(name))?.eventParts ?? []
  const part = parts.find(item => item.order === order)
  if (!part) throw new Error(`no part ${order} on ${name}`)
  return part
}

async function serviceOf(name: string, serviceName: string) {
  const services = (await programme(name))?.eventServiceParts ?? []
  const service = services.find(item => item.name === serviceName)
  if (!service) throw new Error(`no service ${serviceName} on ${name}`)
  return service
}

/** Assigns a part as the route does: the write, then the notices for what changed. */
async function assignPartLikeTheRoute(name: string, order: number, assigneeId: number | null) {
  const { congregationId, adminId } = fixture
  const part = await partOf(name, order)
  return withScope(congregationId, async db => {
    const result = await assignPart(db, part.id, assigneeId, part.assistantId, null, part.topic, congregationId)
    if ('error' in result) return result
    const event = await db.event.findFirstOrThrow({ where: { id: fixture.events[name], congregationId } })
    const ctx = buildAssignmentContext({
      event,
      assignmentName: part.name,
      entityType: 'EventPart',
      entityId: part.id,
      congregationId,
      actorId: adminId,
      ...NOTIFY_CTX,
    })
    await dispatchAssignmentDiffs(
      db,
      ctx,
      partAssignmentDiffs(
        { previousAssigneeId: result.previousAssigneeId, previousAssistantId: result.previousAssistantId },
        { assigneeId, assistantId: part.assistantId },
      ),
    )
    return { hasConflict: result.assignment.hasConflict }
  })
}

async function assignServiceLikeTheRoute(name: string, serviceName: string, assigneeId: number | null) {
  const { congregationId, adminId } = fixture
  const service = await serviceOf(name, serviceName)
  return withScope(congregationId, async db => {
    const result = await assignServicePart(db, service.id, assigneeId, congregationId)
    if ('error' in result) return result
    const event = await db.event.findFirstOrThrow({ where: { id: fixture.events[name], congregationId } })
    const ctx = buildAssignmentContext({
      event,
      assignmentName: service.name,
      entityType: 'EventServicePart',
      entityId: service.id,
      congregationId,
      actorId: adminId,
      ...NOTIFY_CTX,
    })
    await dispatchAssignmentDiffs(
      db,
      ctx,
      servicePartAssignmentDiffs({ previousAssigneeId: result.previousAssigneeId }, { assigneeId }),
    )
    return { hasConflict: result.assignment.hasConflict }
  })
}

/** Publishes as the route does: the release, then its notices outside the transaction. */
async function publishLikeTheRoute(name: string) {
  const { congregationId, adminId } = fixture
  const result = await withScope(congregationId, db => releaseEvent(db, fixture.events[name], congregationId, adminId))
  if (!result || 'error' in result) return result
  await fireReleaseNotifications(result.event, result.notifyTargets, congregationId, adminId, NOTIFY_CTX)
  return { status: result.event.status, notified: result.notifyTargets.length }
}

const journal: { step: string; result: unknown; notices: unknown }[] = []

async function step(name: string, action: () => Promise<unknown>) {
  const result = await action()
  journal.push({ step: name, result, notices: await newNotices() })
}

describe('assignments, publishing and their notices', () => {
  it('flags an absent publisher on a draft and refuses to publish it', async () => {
    const { members } = fixture
    // Hugo is away over the second midweek meeting; the fixture already put him on it.
    await step('second midweek meeting as left by the fixture', async () => programme('midweek-2'))
    await step('publish it while Hugo is on it', () => publishLikeTheRoute('midweek-2'))

    expect(journal.at(-1)?.result).toMatchObject({ reason: 'conflicts' })
    expect(members.hugo).toBeGreaterThan(0)
  })

  it('publishes once the conflicts are gone, notifying everyone on it', async () => {
    const { members } = fixture
    const programmeNow = await programme('midweek-2')
    for (const part of programmeNow?.eventParts ?? []) {
      if (part.hasConflict) await assignPartLikeTheRoute('midweek-2', part.order, members.pierre)
    }
    for (const service of programmeNow?.eventServiceParts ?? []) {
      if (service.hasConflict) await assignServiceLikeTheRoute('midweek-2', service.name, members.luc)
    }
    await newNotices()
    await step('publish the second midweek meeting', () => publishLikeTheRoute('midweek-2'))
    await step('second midweek meeting once published', async () => programme('midweek-2'))
  })

  it('refuses an absent publisher on a published meeting and notifies changes there', async () => {
    const { members } = fixture
    // Part 3 has no allowed roles: only the absence can refuse him.
    await step('put Hugo, away that week, on the published second midweek meeting', () =>
      assignPartLikeTheRoute('midweek-2', 3, members.hugo),
    )
    await step('put Hugo on the elders-only talk of a draft meeting', () =>
      assignPartLikeTheRoute('midweek-3', 2, members.hugo),
    )
    await step('give the first weekend sound to Marc instead of Luc', () =>
      assignServiceLikeTheRoute('weekend-1', 'Audio-vidéo', members.marc),
    )
    await step('take the first midweek opening part from Paul', () => assignPartLikeTheRoute('midweek-1', 1, null))
    await step('assign a part on a draft meeting', () => assignPartLikeTheRoute('midweek-3', 1, members.jean))
  })

  it('cancels the waiting notices when a meeting is unpublished', async () => {
    const { congregationId, adminId } = fixture
    await step('unpublish the first weekend meeting', async () => {
      const result = await withScope(congregationId, db =>
        unreleaseEvent(db, fixture.events['weekend-1'], congregationId, adminId),
      )
      return { status: result?.event.status }
    })
    journal.push({ step: 'every notice so far', result: await noticeStatuses(), notices: [] })
  })

  it('publishes and unpublishes in bulk', async () => {
    const { congregationId, adminId, events } = fixture
    const names = ['weekend-1', 'midweek-3', 'weekend-3', 'memorial-1']
    await step('bulk publish', async () => {
      const result = await bulkReleaseEvents(
        names.map(name => events[name]),
        congregationId,
        adminId,
        NOTIFY_CTX,
      )
      return {
        released: result.released.map(eventLabel),
        blocked: result.blocked.map(item => ({ event: eventLabel(item.id), error: item.error })),
        awaiting: result.awaiting.map(eventLabel),
      }
    })
    await step('bulk unpublish', async () => {
      const result = await bulkUnreleaseEvents([events['midweek-3'], events['weekend-3']], congregationId, adminId)
      return { unreleased: result.unreleased.map(eventLabel), notFound: result.notFound, failed: result.failed }
    })
  })

  it('matches the reference', async () => {
    await expect(reference(journal, fixture.labels)).toMatchFileSnapshot('./__references__/assignments.json')
  })
})
