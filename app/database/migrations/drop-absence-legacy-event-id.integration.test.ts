import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: it reads the catalog, as the schema owner sees it.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20261123090000_drop_absence_legacy_event_id', () => {
  it('drops the column and its unique index', async () => {
    const columns = await testDb.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Absence' AND column_name = 'legacyEventId'`
    const indexes = await testDb.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Absence' AND indexname = 'Absence_legacyEventId_key'`

    expect(columns).toEqual([])
    expect(indexes).toEqual([])
  })
})
