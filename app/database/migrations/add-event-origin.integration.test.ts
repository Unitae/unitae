import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. Its statements are read from
// the shipped file and run inside a rolled-back transaction.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const STATEMENTS = readFileSync(join(import.meta.dirname, '20261119120000_add_event_origin', 'migration.sql'), 'utf8')
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0)

class Rollback extends Error {}

interface Result {
  first: Record<string, string>
  second: Record<string, string>
  bogusRefused: boolean
}

let memo: Promise<Result> | undefined

/** Events in the shape the previous image leaves them: every one at the column's default, « manual ». */
function snapshot(): Promise<Result> {
  memo ??= (async () => {
    let result: Result | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `event-origin-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const author = await tx.userAccount.create({
          data: { email: `${stamp}@test.com`, password: 'x', congregationId },
        })
        const day = new Date('2026-12-03T18:00:00Z')
        const event = (name: string, createdById: number | null) =>
          tx.event.create({ data: { name, startDate: day, endDate: day, createdById, congregationId } })

        const ids = {
          emptyJob: (await event('empty, no author', null)).id,
          withPart: (await event('a part, no author', null)).id,
          withService: (await event('a service, no author', null)).id,
          withCounts: (await event('counts, no author', null)).id,
          handMade: (await event('empty, an author', author.id)).id,
        }
        await tx.eventPart.create({ data: { name: 'Cantique', eventId: ids.withPart, congregationId } })
        await tx.eventServicePart.create({ data: { name: 'Sono', eventId: ids.withService, congregationId } })
        await tx.attendance.create({ data: { eventId: ids.withCounts, inPerson: 40, congregationId } })

        const read = async () => {
          const rows = await tx.event.findMany({ where: { congregationId }, select: { id: true, origin: true } })
          const byId = new Map(rows.map(row => [row.id, row.origin]))
          return Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, byId.get(id) ?? '']))
        }

        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        const first = await read()
        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        const second = await read()

        let bogusRefused = false
        try {
          await tx.$executeRawUnsafe('SAVEPOINT bogus')
          await tx.$executeRawUnsafe(`UPDATE "Event" SET "origin" = 'bogus' WHERE "id" = ${ids.handMade}`)
        } catch {
          bogusRefused = true
        } finally {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT bogus')
        }

        result = { first, second, bogusRefused }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    return result as Result
  })()
  return memo
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20261119120000_add_event_origin', () => {
  it('marks as the job’s only the events that were empty meetings: no author, nothing on them', async () => {
    const { first } = await snapshot()

    expect(first).toEqual({
      emptyJob: 'job',
      withPart: 'manual',
      withService: 'manual',
      withCounts: 'manual',
      handMade: 'manual',
    })
  })

  it('changes nothing when run twice', async () => {
    const { first, second } = await snapshot()

    expect(second).toEqual(first)
  })

  it('refuses an origin it does not know', async () => {
    const { bogusRefused } = await snapshot()

    expect(bogusRefused).toBe(true)
  })
})
