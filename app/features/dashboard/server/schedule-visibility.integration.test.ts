import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { type DivergingMeeting, divergingMeeting } from '~/tests/helpers/diverging-schedules'

// What members see on the dashboard follows each schedule, not the event's status (spec D46): a meeting whose duties
// are published while its programme is a draft shows its duties alone; with both drafts it does not show at all, even
// while the event itself is still released.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { getConflictingAssignments, getNextMeeting } = await import('./dashboard.server')
const { getUpcomingAssignments } = await import('./get-upcoming-assignments.server')

class Rollback extends Error {}

/** Runs `fn` over a fresh diverging meeting inside a transaction that is rolled back. */
async function withMeeting<T>(fn: (db: TransactionClient, meeting: DivergingMeeting) => Promise<T>): Promise<T> {
  let result: { value: T } | undefined
  try {
    await testDb.$transaction(
      async tx => {
        const db = tx as unknown as TransactionClient
        const stamp = `visibility-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        result = { value: await fn(db, await divergingMeeting(db, stamp)) }
        throw new Rollback()
      },
      { timeout: 20_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  if (!result) throw new Error('the fixture never ran')
  return result.value
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('the dashboard by schedule', () => {
  it('shows a meeting whose duties alone are published with its duties only', async () => {
    const seen = await withMeeting(async (db, meeting) => {
      await meeting.publish({ programme: 'draft', duty: 'published' })
      const next = await getNextMeeting(db, meeting.memberId, meeting.congregationId)
      const upcoming = await getUpcomingAssignments(db, meeting.memberId, meeting.congregationId)
      const conflict = await getConflictingAssignments(db, meeting.memberId)
      return {
        next: next && {
          id: next.id,
          parts: next.eventParts.map(part => part.name),
          duties: next.eventServiceParts.map(duty => duty.name),
        },
        upcoming: upcoming.map(assignment => assignment.name),
        conflict: conflict?.name ?? null,
        meeting,
      }
    })

    expect(seen.next).toEqual({ id: seen.meeting.eventId, parts: [], duties: [seen.meeting.dutyName] })
    expect(seen.upcoming).toEqual([seen.meeting.dutyName])
    expect(seen.conflict).toBe(seen.meeting.dutyName)
  })

  it('hides a meeting whose schedules are all drafts, though the event is released', async () => {
    const seen = await withMeeting(async (db, meeting) => {
      await meeting.publish({ programme: 'draft', duty: 'draft' })
      return {
        next: await getNextMeeting(db, meeting.memberId, meeting.congregationId),
        upcoming: await getUpcomingAssignments(db, meeting.memberId, meeting.congregationId),
        conflict: await getConflictingAssignments(db, meeting.memberId),
      }
    })

    expect(seen).toEqual({ next: null, upcoming: [], conflict: null })
  })
})
