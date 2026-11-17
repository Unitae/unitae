import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { dayOf } from '~/shared/utils/calendar-day'

vi.mock('~/shared/domain/audit.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/audit.server')>()),
  audit: vi.fn(),
}))

// What a mocked client cannot vouch for: the empty-meeting filters (no part, no service, no attendance) as Prisma and
// RLS read them under the runtime role, moving meetings within their week, and creating a meeting's programme once.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const { countMeetingsToMove } = await import('./empty-meetings.queries')
const { moveEmptyMeetings } = await import('./move-empty-meetings.server')
const { createMeetingProgramme } = await import('./create-meeting-programme.server')
const { listProgrammes } = await import('./programme-list.queries')
const { ProgrammeExistsError } = await import('./programme-creation.server')

const PARIS = 'Europe/Paris'
// Monday 16 November 2026, 10:00 in Paris.
const NOW = new Date('2026-11-16T09:00:00Z')
const ts = Date.now()
let congregationId: number
let templateId: number
let actorId: number
const ids: Record<string, number> = {}

// The seeded Tuesday at 19:00 Paris.
const tuesday = (day: string) => ({ startDate: new Date(`${day}T18:00:00Z`), endDate: new Date(`${day}T19:45:00Z`) })

beforeAll(async () => {
  congregationId = (
    await testDb.congregation.create({ data: { name: `Empty ${ts}`, slug: `empty-${ts}`, active: true } })
  ).id
  await withScope(congregationId, async tx => {
    actorId = (
      await tx.userAccount.create({ data: { email: `empty-${ts}@test.invalid`, password: 'x', congregationId } })
    ).id
    templateId = (
      await tx.eventTemplate.create({
        data: {
          name: 'Réunion de semaine',
          key: `midweek-${ts}`,
          weekDay: 2,
          startTime: '19:00',
          endTime: '20:45',
          congregationId,
          parts: { create: [{ name: 'Joyaux', order: 1, congregationId }] },
        },
      })
    ).id
    const meeting = (day: string, extra: object = {}) =>
      tx.event.create({
        data: { name: 'Réunion de semaine', templateId, status: 'draft', congregationId, ...tuesday(day), ...extra },
      })
    ids.week1 = (await meeting('2026-11-17')).id
    ids.week2 = (await meeting('2026-11-24')).id
    ids.week3 = (await meeting('2026-12-01')).id
    // Counted already: attendance keeps a meeting where it is.
    ids.counted = (await meeting('2026-12-08')).id
    await tx.attendance.create({ data: { eventId: ids.counted, inPerson: 80, congregationId } })
    // The week of 30 November already has its programme on the Thursday.
    ids.prepared = (
      await tx.event.create({
        data: {
          name: 'Réunion de semaine',
          templateId,
          status: 'draft',
          congregationId,
          createdById: actorId,
          startDate: new Date('2026-12-03T18:00:00Z'),
          endDate: new Date('2026-12-03T19:45:00Z'),
          eventParts: { create: [{ name: 'Joyaux', congregationId }] },
        },
      })
    ).id
    // The template now meets on Thursday.
    await tx.eventTemplate.update({ where: { id: templateId }, data: { weekDay: 4 } })
  })
})

afterAll(async () => {
  if (congregationId) {
    await withScope(congregationId, async tx => {
      await tx.auditLog.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

const ctx = () => ({ congregationId, timeZone: PARIS, now: NOW })
const days = () =>
  withScope(congregationId, async tx =>
    Object.fromEntries(
      (await tx.event.findMany({ where: { templateId }, select: { id: true, startDate: true } })).map(event => [
        event.id,
        dayOf(event.startDate, PARIS),
      ]),
    ),
  )

describe('empty meetings against the database', () => {
  it('lists the empty meetings as waiting for their programme, and not the prepared or counted ones', async () => {
    const rows = await withScope(congregationId, tx =>
      listProgrammes(tx, { congregationId, from: NOW, to: new Date('2026-12-31T00:00:00Z') }),
    )
    const awaiting = Object.fromEntries(rows.map(row => [row.id, row.awaitingProgramme]))

    expect(awaiting).toMatchObject({ [ids.week1]: true, [ids.prepared]: false })
  })

  it('moves each empty meeting to its week’s Thursday, deletes the one whose week has its programme, and leaves the counted one', async () => {
    expect(await withScope(congregationId, tx => countMeetingsToMove(tx, templateId, ctx()))).toBe(3)

    const result = await withScope(congregationId, tx => moveEmptyMeetings(tx, templateId, { ...ctx(), actorId }))

    expect(result).toEqual({ moved: 2, removed: 1 })
    const after = await days()
    expect(after[ids.week1]).toBe('2026-11-19')
    expect(after[ids.week2]).toBe('2026-11-26')
    expect(after[ids.week3]).toBeUndefined()
    expect(after[ids.counted]).toBe('2026-12-08')
    expect(after[ids.prepared]).toBe('2026-12-03')
    expect(await withScope(congregationId, tx => countMeetingsToMove(tx, templateId, ctx()))).toBe(0)
  })

  it('creates a meeting’s programme once, recording who prepared it', async () => {
    const created = await withScope(congregationId, tx =>
      createMeetingProgramme(tx, ids.week1, { congregationId, timezone: PARIS, actorId }),
    )
    expect(created).toEqual({ id: ids.week1, templateId, day: '2026-11-19' })

    const event = await withScope(congregationId, tx =>
      tx.event.findFirst({
        where: { id: ids.week1 },
        select: { createdById: true, _count: { select: { eventParts: true } } },
      }),
    )
    expect(event).toEqual({ createdById: actorId, _count: { eventParts: 1 } })

    await expect(
      withScope(congregationId, tx =>
        createMeetingProgramme(tx, ids.week1, { congregationId, timezone: PARIS, actorId }),
      ),
    ).rejects.toBeInstanceOf(ProgrammeExistsError)
  })
})
