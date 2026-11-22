import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { settleFixtureSchedules } from '~/tests/helpers/settle-fixture-schedules'

// The external speakers' readers against real rows (plan T12): they read items, a part's only. A duty named like the
// speaker's part, in-house, sits beside it in every meeting and must never count as the speaker's visit or slot.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { listSpeakerDirectory, getSpeakerVisits } = await import('./external-speakers.queries')
const { resolveExternalSpeakerCadence } = await import('./resolve-external-speaker-cadence.server')

const NOW = new Date('2027-02-01T12:00:00Z')
const DAYS = ['2027-01-10', '2027-01-17', '2027-01-24', '2027-02-07']

class Rollback extends Error {}

interface Result {
  speakerId: number
  directory: { visitCount: number; lastVisit: Date | null; nextVisit: { date: Date } | null } | undefined
  visits: { upcoming: string[]; past: string[] }
  cadence: { past: { assigned: boolean; personName: string | null }[]; future: unknown[]; hasHistory: boolean }
}

let memo: Promise<Result> | undefined

function snapshot(): Promise<Result> {
  memo ??= (async () => {
    let result: Result | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `speakers-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const speaker = await tx.externalSpeaker.create({ data: { name: 'Jean DURAND', congregationId } })
          const member = await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
          const template = await tx.eventTemplate.create({
            data: { name: 'Réunion du week-end', key: `weekend-${stamp}`, congregationId },
          })
          const parts: number[] = []
          for (const [index, day] of DAYS.entries()) {
            const event = await tx.event.create({
              data: {
                name: 'Réunion',
                startDate: new Date(`${day}T09:00:00Z`),
                endDate: new Date(`${day}T10:45:00Z`),
                status: 'released',
                templateId: template.id,
                congregationId,
              },
            })
            // The speaker gives the talk every week but the second, when nobody does.
            const part = await tx.eventPart.create({
              data: {
                name: 'Discours public',
                eventId: event.id,
                externalSpeakerId: index === 1 ? null : speaker.id,
                congregationId,
              },
            })
            parts.push(part.id)
            await tx.eventServicePart.create({
              data: { name: 'Discours public', eventId: event.id, assigneeId: member.id, congregationId },
            })
          }
          await settleFixtureSchedules(db, congregationId)
          const current = await tx.event.findFirstOrThrow({ where: { startDate: new Date(`${DAYS[2]}T09:00:00Z`) } })

          const directory = (await listSpeakerDirectory(db, congregationId, NOW)).speakers.find(
            row => row.id === speaker.id,
          )
          const visits = await getSpeakerVisits(db, congregationId, speaker.id, NOW)
          const cadence = await resolveExternalSpeakerCadence(db, {
            externalSpeakerId: speaker.id,
            event: current,
            congregationId,
            excludePartAssignmentId: parts[2],
          })
          result = {
            speakerId: speaker.id,
            directory,
            visits: {
              upcoming: visits.upcoming.map(visit => visit.date.toISOString().slice(0, 10)),
              past: visits.past.map(visit => visit.date.toISOString().slice(0, 10)),
            },
            cadence,
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

describe("external speakers' readers", () => {
  it('counts the visits a speaker gave, the last one and the next one', async () => {
    const { directory } = await snapshot()

    expect(directory).toMatchObject({
      visitCount: 3,
      lastVisit: new Date(`${DAYS[2]}T09:00:00Z`),
      nextVisit: { date: new Date(`${DAYS[3]}T09:00:00Z`) },
    })
  })

  it("lists a speaker's visits, upcoming soonest first and past latest first", async () => {
    const { visits } = await snapshot()

    expect(visits).toEqual({ upcoming: [DAYS[3]], past: [DAYS[2], DAYS[0]] })
  })

  it("follows the speaker's part from meeting to meeting, never the duty named like it", async () => {
    const { cadence } = await snapshot()

    expect(cadence.hasHistory).toBe(true)
    expect(cadence.past.map(entry => ({ assigned: entry.assigned, personName: entry.personName }))).toEqual([
      { assigned: true, personName: 'Jean DURAND' },
      { assigned: false, personName: null },
    ])
    expect(cadence.future).toHaveLength(1)
  })
})
