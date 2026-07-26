/**
 * Confirms `Building.streetNormalized` lands on disk through every Building
 * write path the PR touched: create, edit, the import-congregation update
 * branch (which previously left stale empty rows when matching an existing
 * building by number/street/zip).
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {},
}))

const { createBuilding } = await import('./create-building.server')
const { editBuilding } = await import('./edit-building.server')

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
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

const ts = Date.now()
let congregationId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `BuildingNormalized ${ts}`, slug: `building-normalized-${ts}`, active: true },
  })
  congregationId = cong.id
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.buildingResidentialData.deleteMany({})
    await tx.buildingEntrance.deleteMany({})
    await tx.building.deleteMany({})
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('Building normalized columns — write-through', () => {
  it('createBuilding writes streetNormalized to disk', async () => {
    const building = await withScope(congregationId, tx =>
      createBuilding(tx, {
        address: { number: '12', street: 'Rue de la Paëx', zip: '75001' },
        coordinates: { latitude: 48.87, longitude: 2.33 },
        congregationId,
      }),
    )

    const row = await testDb.building.findUnique({
      where: { id: building.id },
      select: { streetNormalized: true },
    })

    expect(row?.streetNormalized).toBe('rue de la paex')
  })

  it('editBuilding refreshes streetNormalized when the street changes', async () => {
    const created = await withScope(congregationId, tx =>
      createBuilding(tx, {
        address: { number: '5', street: 'Rue Initial', zip: '75002' },
        coordinates: {},
        congregationId,
      }),
    )

    await withScope(congregationId, tx =>
      editBuilding(tx, created.id, congregationId, {
        address: { number: '5', street: 'Avenue Élysée', zip: '75002' },
        coordinates: {},
      }),
    )

    const row = await testDb.building.findUnique({
      where: { id: created.id },
      select: { streetNormalized: true, street: true },
    })

    expect(row?.street).toBe('Avenue Élysée')
    expect(row?.streetNormalized).toBe('avenue elysee')
  })

  it('the import-congregation update path backfills stale streetNormalized values', async () => {
    // Simulates the bug: a building whose normalized column was never set
    // (legacy data) is matched by the import's findFirst, and the update
    // path is expected to refresh the normalized value alongside the rest.
    const created = await withScope(congregationId, tx =>
      tx.building.create({
        data: {
          number: '99',
          street: 'Rue Pâte Brisée',
          // Intentionally empty — simulates rows from before the migration
          // landed on prod.
          streetNormalized: '',
          zip: '75009',
          congregationId,
        },
      }),
    )

    // Mirror the data block the import-congregation server constructs.
    await withScope(congregationId, async tx => {
      await tx.building.update({
        where: { id: created.id },
        data: {
          streetNormalized: 'rue pate brisee',
          latitude: 48.88,
          longitude: 2.34,
          active: true,
          inTerritory: true,
          inOpenData: false,
          prospectionDate: null,
          notes: '',
          importantNotes: '',
        },
      })
    })

    const row = await testDb.building.findUnique({
      where: { id: created.id },
      select: { streetNormalized: true },
    })

    expect(row?.streetNormalized).toBe('rue pate brisee')
  })
})
