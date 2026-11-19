import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: it reads the catalog, as the schema owner sees it.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20261122090000_event_author_set_null', () => {
  // The author only says who prepared an event: deleting the account clears it, it no longer refuses.
  it('clears an event’s author when the account is deleted', async () => {
    const rows = await testDb.$queryRaw<{ delete_rule: string; update_rule: string }[]>`
      SELECT delete_rule, update_rule FROM information_schema.referential_constraints
      WHERE constraint_name = 'Event_createdById_fkey'`

    expect(rows).toEqual([{ delete_rule: 'SET NULL', update_rule: 'CASCADE' }])
  })
})
