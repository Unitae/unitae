import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

vi.mock('~/shared/domain/audit.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/audit.server')>()),
  audit: vi.fn(),
}))

// What a mocked client cannot vouch for: the template lock and the author-less events under the runtime role, and a
// second run creating nothing — a removed day is never refilled.

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

const { extendRecurringEvents } = await import('./recurring-events.server')

const PARIS = 'Europe/Paris'
// Monday 16 November 2026, 02:00 in Paris.
const NOW = new Date('2026-11-16T01:00:00Z')
const ts = Date.now()
let congregationId: number
let templateId: number

beforeAll(async () => {
  congregationId = (
    await testDb.congregation.create({ data: { name: `Recurring ${ts}`, slug: `recurring-${ts}`, active: true } })
  ).id
  await withScope(congregationId, async tx => {
    templateId = (
      await tx.eventTemplate.create({
        data: {
          name: 'Réunion de semaine',
          key: `midweek-${ts}`,
          weekDay: 4,
          startTime: '19:00',
          endTime: '20:45',
          congregationId,
        },
      })
    ).id
    await tx.eventTemplate.create({ data: { name: 'Mémorial', key: `memorial-${ts}`, weekDay: null, congregationId } })
  })
})

afterAll(async () => {
  if (congregationId) {
    await withScope(congregationId, async tx => {
      await tx.auditLog.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

const run = () =>
  withScope(congregationId, tx => extendRecurringEvents(tx, { congregationId, timeZone: PARIS, now: NOW }))
const events = () =>
  withScope(congregationId, tx =>
    tx.event.findMany({
      where: { templateId },
      orderBy: { startDate: 'asc' },
      select: { id: true, startDate: true, createdById: true, status: true },
    }),
  )

describe('extendRecurringEvents', () => {
  it('creates two months of author-less draft meetings, and none for a template without a weekday', async () => {
    expect(await run()).toBe(9)

    const created = await events()
    expect(created).toHaveLength(9)
    expect(created.every(event => event.createdById == null && event.status === 'draft')).toBe(true)
    expect(created[0]?.startDate).toEqual(new Date('2026-11-19T18:00:00Z'))
    const all = await withScope(congregationId, tx => tx.event.count())
    expect(all).toBe(9)
  })

  it('creates nothing on a second run, and never brings back a day someone removed', async () => {
    const [first] = await events()
    await withScope(congregationId, tx => tx.event.deleteMany({ where: { id: first?.id } }))

    expect(await run()).toBe(0)
    expect(await events()).toHaveLength(8)
  })
})
