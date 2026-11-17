import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { addDays, dayOf } from '~/shared/utils/calendar-day'

vi.mock('~/shared/domain/audit.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/audit.server')>()),
  audit: vi.fn(),
}))

// Nothing keys an event on (template, day): only the template's row lock keeps the recurring-events job and a series
// from both creating a day. This runs the two at the same moment, in two real transactions, under the runtime role.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 4,
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
const { createProgrammeSeries } = await import('./programme-creation.server')

const PARIS = 'Europe/Paris'
const ts = Date.now()
let congregationId: number
let actorId: number

beforeAll(async () => {
  congregationId = (
    await testDb.congregation.create({ data: { name: `Race ${ts}`, slug: `race-${ts}`, active: true } })
  ).id
  await withScope(congregationId, async tx => {
    actorId = (
      await tx.userAccount.create({ data: { email: `race-${ts}@unitae.test`, password: 'x', congregationId } })
    ).id
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

describe('the recurring-events job and a series, at the same moment', () => {
  it('never creates a day twice', async () => {
    const today = dayOf(new Date(), PARIS)
    for (let round = 0; round < 3; round++) {
      // A new template each round, with no events and no mark, as on the day a congregation begins; the job finds the
      // earlier rounds' templates already extended.
      const templateId = await withScope(congregationId, async tx => {
        const template = await tx.eventTemplate.create({
          data: {
            name: 'Réunion de semaine',
            key: `midweek-${ts}-${round}`,
            weekDay: round + 1,
            startTime: '19:00',
            endTime: '20:45',
            congregationId,
          },
        })
        return template.id
      })
      await Promise.all([
        withScope(congregationId, tx =>
          extendRecurringEvents(tx, { congregationId, timeZone: PARIS, now: new Date() }),
        ),
        withScope(congregationId, tx =>
          createProgrammeSeries(
            tx,
            { templateIds: [templateId], from: addDays(today, 1), to: addDays(today, 28) },
            { congregationId, timezone: PARIS, actorId },
          ),
        ),
      ])

      const events = await withScope(congregationId, tx =>
        tx.event.findMany({ where: { templateId }, select: { startDate: true } }),
      )
      const days = events.map(event => dayOf(event.startDate, PARIS))
      expect(days.length).toBeGreaterThan(4)
      expect(new Set(days).size).toBe(days.length)
    }
  })
})
