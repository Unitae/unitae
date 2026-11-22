import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { type DivergingMeeting, divergingMeeting } from '~/tests/helpers/diverging-schedules'

// The board's programme documents follow each schedule, not the event's status (spec D46): a meeting whose duties are
// published while its programme is a draft shows its services alone; with both drafts it is off the board, even while
// the event itself is still released.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { getDynamicDocumentData, getDynamicPreview } = await import('./dynamic-documents.server')

class Rollback extends Error {}

async function withMeeting<T>(fn: (db: TransactionClient, meeting: DivergingMeeting) => Promise<T>): Promise<T> {
  let result: { value: T } | undefined
  try {
    await testDb.$transaction(
      async tx => {
        const db = tx as unknown as TransactionClient
        const stamp = `board-visibility-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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

/** The programme document's events, each with the names of its parts and services. */
async function programme(db: TransactionClient, meeting: DivergingMeeting) {
  const data = await getDynamicDocumentData(db, 'programme', meeting.templateKey, meeting.congregationId, {
    showServices: true,
  })
  if (data?.type !== 'programme') throw new Error('not a programme document')
  return data.events.map(event => ({
    id: event.id,
    parts: event.eventParts.map(part => part.name),
    services: (event.eventServiceParts ?? []).map(service => service.name),
  }))
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe("the board's programme by schedule", () => {
  it('shows a meeting whose duties alone are published with its services only', async () => {
    const seen = await withMeeting(async (db, meeting) => {
      await meeting.publish({ programme: 'draft', duty: 'published' })
      return { events: await programme(db, meeting), meeting }
    })

    expect(seen.events).toEqual([{ id: seen.meeting.eventId, parts: [], services: [seen.meeting.dutyName] }])
  })

  it('leaves a meeting whose schedules are all drafts off the board, though the event is released', async () => {
    const seen = await withMeeting(async (db, meeting) => {
      await meeting.publish({ programme: 'draft', duty: 'draft' })
      return {
        events: await programme(db, meeting),
        preview: await getDynamicPreview(db, 'programme', meeting.templateKey, meeting.congregationId),
      }
    })

    expect(seen.events).toEqual([])
    expect(seen.preview ?? '').not.toContain('Prochain')
  })
})
