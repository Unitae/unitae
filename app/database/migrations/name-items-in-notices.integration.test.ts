import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. It only rewrites rows, so
// its statements run inside a rolled-back transaction over notices the previous image could have left pending.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const STATEMENTS = readFileSync(
  join(import.meta.dirname, '20261127090000_name_items_in_notices', 'migration.sql'),
  'utf8',
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(Boolean)

class Rollback extends Error {}

type Notice = { entityType: string; entityId: number; debounceKey: string; status: string }

interface Result {
  partItemId: number
  dutyItemId: number
  partNotice: Notice
  roleNotice: Notice
  dutyNotice: Notice
  sentNotice: Notice
  orphanNotice: Notice
  otherNotice: Notice
  /** Each notice after a second run: the file is idempotent. */
  afterSecondRun: Notice[]
}

let memo: Promise<Result> | undefined

function snapshot(): Promise<Result> {
  memo ??= (async () => {
    let result: Result | undefined
    try {
      await testDb.$transaction(async tx => {
        const run = async () => {
          for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        }
        const stamp = `notices-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const event = await tx.event.create({
          data: {
            name: 'Réunion',
            startDate: new Date('2027-01-07T18:00:00Z'),
            endDate: new Date('2027-01-07T19:45:00Z'),
            congregationId,
          },
        })
        // The old rows the previous image wrote; their mirrors are the items the notices must name.
        const part = await tx.eventPart.create({ data: { name: 'Discours', eventId: event.id, congregationId } })
        const duty = await tx.eventServicePart.create({ data: { name: 'Sono', eventId: event.id, congregationId } })
        const partItem = await tx.item.findUniqueOrThrow({ where: { legacyPartId: part.id }, select: { id: true } })
        const dutyItem = await tx.item.findUniqueOrThrow({ where: { legacyServiceId: duty.id }, select: { id: true } })

        const notice = (entityType: string, entityId: number, recipient: string, status = 'pending') =>
          tx.notificationEvent.create({
            data: {
              type: 'programme-assignment-assigned',
              entityType,
              entityId,
              congregationId,
              status,
              payload: '{}',
              debounceKey: `${entityType}:${entityId}:${recipient}`,
            },
            select: { id: true },
          })
        const ids = {
          part: (await notice('EventPart', part.id, 'user:5')).id,
          role: (await notice('EventPart', part.id, 'role:programme-manager')).id,
          duty: (await notice('EventServicePart', duty.id, 'user:6')).id,
          // Sent already: history keeps its name.
          sent: (await notice('EventPart', part.id, 'user:7', 'sent')).id,
          // An old row whose item is gone (deleted since): nothing to name, left as it is.
          orphan: (await notice('EventPart', 2_000_000_000, 'user:8')).id,
          other: (await notice('Event', event.id, 'user:9')).id,
        }
        const read = (id: number) =>
          tx.notificationEvent.findUniqueOrThrow({
            where: { id },
            select: { entityType: true, entityId: true, debounceKey: true, status: true },
          })

        await run()
        const first = {
          partNotice: await read(ids.part),
          roleNotice: await read(ids.role),
          dutyNotice: await read(ids.duty),
          sentNotice: await read(ids.sent),
          orphanNotice: await read(ids.orphan),
          otherNotice: await read(ids.other),
        }
        await run()
        const afterSecondRun = await Promise.all(Object.values(ids).map(read))
        result = { partItemId: partItem.id, dutyItemId: dutyItem.id, ...first, afterSecondRun }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (!result) throw new Error('fixture did not run')
    return result
  })()
  return memo
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('migration name_items_in_notices', () => {
  it('names the item in a pending notice about a part, and in its debounce key', async () => {
    const { partNotice, partItemId } = await snapshot()
    expect(partNotice).toEqual({
      entityType: 'Item',
      entityId: partItemId,
      debounceKey: `Item:${partItemId}:user:5`,
      status: 'pending',
    })
  })

  it('keeps the recipient part of the key, a role as much as a person', async () => {
    const { roleNotice, partItemId } = await snapshot()
    expect(roleNotice.debounceKey).toBe(`Item:${partItemId}:role:programme-manager`)
  })

  it('names the item in a pending notice about a duty', async () => {
    const { dutyNotice, dutyItemId } = await snapshot()
    expect(dutyNotice).toMatchObject({
      entityType: 'Item',
      entityId: dutyItemId,
      debounceKey: `Item:${dutyItemId}:user:6`,
    })
  })

  it('leaves sent notices, notices whose item is gone and other kinds of notices alone', async () => {
    const { sentNotice, orphanNotice, otherNotice } = await snapshot()
    expect(sentNotice.entityType).toBe('EventPart')
    expect(orphanNotice).toMatchObject({ entityType: 'EventPart', entityId: 2_000_000_000 })
    expect(otherNotice.entityType).toBe('Event')
  })

  it('changes nothing on a second run', async () => {
    const { afterSecondRun, partNotice, roleNotice, dutyNotice, sentNotice, orphanNotice, otherNotice } =
      await snapshot()
    expect(afterSecondRun).toEqual([partNotice, roleNotice, dutyNotice, sentNotice, orphanNotice, otherNotice])
  })
})
