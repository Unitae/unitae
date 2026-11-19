import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. Its statements are read from
// the shipped file and run inside a rolled-back transaction. Dates are written in SQL, so the test does not lean on
// Prisma's @updatedAt.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const STATEMENTS = readFileSync(
  join(import.meta.dirname, '20261120090100_catch_up_event_origin', 'migration.sql'),
  'utf8',
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0)

class Rollback extends Error {}

let memo: Promise<{ first: Record<string, string>; second: Record<string, string> }> | undefined

function snapshot() {
  memo ??= (async () => {
    let result: { first: Record<string, string>; second: Record<string, string> } | undefined
    try {
      await testDb.$transaction(async tx => {
        const finished = await tx.$queryRaw<{ finished_at: Date }[]>`
          SELECT "finished_at" FROM "_prisma_migrations" WHERE "migration_name" = '20261119120000_add_event_origin'`
        // The window starts there: a database without it would make the test prove nothing.
        if (!finished[0]?.finished_at) throw new Error('20261119120000_add_event_origin has not been applied')
        const inWindow = new Date(finished[0].finished_at.getTime() + 60_000)
        const before = new Date('2020-01-01T00:00:00Z')

        const stamp = `catch-up-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const templateId = (
          await tx.eventTemplate.create({ data: { name: 'Réunion', key: `midweek-${stamp}`, congregationId } })
        ).id
        const author = await tx.userAccount.create({
          data: { email: `${stamp}@test.com`, password: 'x', congregationId },
        })

        const insert = async (name: string, createdAt: Date, updatedAt: Date, extra = '') => {
          const rows = await tx.$queryRawUnsafe<{ id: number }[]>(
            `INSERT INTO "Event" ("name", "startDate", "endDate", "templateId", "congregationId", "createdAt", "updatedAt"${extra ? ', "createdById"' : ''})
             VALUES ($1, $2, $2, $3, $4, $5, $6${extra ? `, ${extra}` : ''}) RETURNING "id"`,
            name,
            new Date('2027-01-05T18:00:00Z'),
            templateId,
            congregationId,
            createdAt,
            updatedAt,
          )
          return rows[0].id
        }

        const ids: Record<string, number> = {
          // The previous image's job, during the rollout: empty, no author, never written since.
          rolloutJob: await insert('rollout job', inWindow, inWindow),
          // Older than the window: 20261119120000_add_event_origin's own backfill already decided it.
          beforeWindow: await insert('before the window', before, before),
          // Made by hand in the window, its author's account deleted since: clearing the author was a write.
          authorCleared: await insert('author cleared', inWindow, new Date(inWindow.getTime() + 3_600_000)),
          // Made by hand, still with its author.
          authored: await insert('authored', inWindow, inWindow, String(author.id)),
        }
        // Prepared during the window: a part on it.
        ids.prepared = await insert('prepared', inWindow, inWindow)
        await tx.eventPart.create({ data: { name: 'Cantique', eventId: ids.prepared, congregationId } })

        const read = async () => {
          const rows = await tx.event.findMany({ where: { congregationId }, select: { name: true, origin: true } })
          return Object.fromEntries(rows.map(row => [row.name, row.origin]))
        }
        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        const first = await read()
        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        result = { first, second: await read() }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    return result as { first: Record<string, string>; second: Record<string, string> }
  })()
  return memo
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20261120090100_catch_up_event_origin', () => {
  it('gives « job » to the previous image’s empty meetings of the rollout, and to nothing else', async () => {
    const { first } = await snapshot()

    expect(first).toEqual({
      'rollout job': 'job',
      'before the window': 'manual',
      'author cleared': 'manual',
      authored: 'manual',
      prepared: 'manual',
    })
  })

  it('changes nothing when run twice', async () => {
    const { first, second } = await snapshot()

    expect(second).toEqual(first)
  })
})
