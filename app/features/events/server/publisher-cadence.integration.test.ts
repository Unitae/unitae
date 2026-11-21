import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// A publisher's cadence on a part and on a duty, against real rows (plan T12): the readers read items, one kind each. In
// every meeting a part is named like the duty and a duty like the part, both held by someone else: they must never show
// in the other's cadence.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { resolvePublisherCadence } = await import('./resolve-publisher-cadence.server')

const DAYS = ['2027-03-04', '2027-03-11', '2027-03-18', '2027-03-25', '2027-04-01']
const CURRENT = 3

class Rollback extends Error {}

type Entry = { assigned: boolean; personName: string | null }
interface Cadence {
  past: Entry[]
  future: Entry[]
  hasHistory: boolean
  savedMatchesSelection: boolean
}

let memo: Promise<{ part: Cadence; duty: Cadence }> | undefined

function snapshot() {
  memo ??= (async () => {
    let result: { part: Cadence; duty: Cadence } | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `cadence-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const paul = await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
          const luc = await tx.member.create({ data: { firstname: 'Luc', lastname: 'ROUX', congregationId } })
          const template = await tx.eventTemplate.create({
            data: { name: 'Réunion de semaine', key: `midweek-${stamp}`, congregationId },
          })
          let current: {
            event: { id: number; templateId: number | null; startDate: Date }
            part: number
            duty: number
          } = {
            event: { id: 0, templateId: template.id, startDate: new Date() },
            part: 0,
            duty: 0,
          }
          for (const [index, day] of DAYS.entries()) {
            const event = await tx.event.create({
              data: {
                name: 'Réunion',
                startDate: new Date(`${day}T18:00:00Z`),
                endDate: new Date(`${day}T19:45:00Z`),
                status: 'released',
                templateId: template.id,
                congregationId,
              },
            })
            // Paul reads and runs the sound in the first two meetings; the third has nobody on either.
            const holder = index < 2 ? paul.id : null
            const part = await tx.eventPart.create({
              data: { name: 'Lecture', eventId: event.id, assigneeId: holder, congregationId },
            })
            const duty = await tx.eventServicePart.create({
              data: { name: 'Sono', eventId: event.id, assigneeId: holder, congregationId },
            })
            await tx.eventPart.create({ data: { name: 'Sono', eventId: event.id, assigneeId: luc.id, congregationId } })
            await tx.eventServicePart.create({
              data: { name: 'Lecture', eventId: event.id, assigneeId: luc.id, congregationId },
            })
            if (index === CURRENT) current = { event, part: part.id, duty: duty.id }
          }
          const ask = (anchor: { excludePartAssignmentId: number | null; excludeServiceAssignmentId: number | null }) =>
            resolvePublisherCadence(db, {
              userId: paul.id,
              event: current.event,
              congregationId,
              partSlot: 'assignee',
              ...anchor,
            })
          result = {
            part: await ask({ excludePartAssignmentId: current.part, excludeServiceAssignmentId: null }),
            duty: await ask({ excludePartAssignmentId: null, excludeServiceAssignmentId: current.duty }),
          }
          throw new Rollback()
        },
        { timeout: 20_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (!result) throw new Error('the fixture never ran')
    return result
  })()
  return memo
}

afterAll(async () => {
  await testDb.$disconnect()
})

const PAST = [
  { assigned: true, personName: 'Paul MARTIN' },
  { assigned: true, personName: 'Paul MARTIN' },
  { assigned: false, personName: null },
]

describe("a publisher's cadence", () => {
  it('follows the part from meeting to meeting, never the duty named like it', async () => {
    const { part } = await snapshot()

    expect(part.past.map(({ assigned, personName }) => ({ assigned, personName }))).toEqual(PAST)
    expect(part).toMatchObject({ hasHistory: true, savedMatchesSelection: false })
    expect(part.future).toHaveLength(1)
  })

  it('follows the duty from meeting to meeting, never the part named like it', async () => {
    const { duty } = await snapshot()

    expect(duty.past.map(({ assigned, personName }) => ({ assigned, personName }))).toEqual(PAST)
    expect(duty).toMatchObject({ hasHistory: true, savedMatchesSelection: false })
    expect(duty.future).toHaveLength(1)
  })
})
