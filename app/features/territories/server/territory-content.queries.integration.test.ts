import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

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
let congId: number
let classicalTerritoryId: number
let commerceTerritoryId: number

const { getTerritoryContent } = await import('./territory-content.queries')

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Content ${ts}`, slug: `content-${ts}`, active: true },
  })
  congId = cong.id

  await withScope(congId, async tx => {
    const classical = await tx.territory.create({
      data: { number: `C-${ts}`, type: TerritoryKind.Classical, congregationId: congId },
    })
    classicalTerritoryId = classical.id
    const commerce = await tx.territory.create({
      data: { number: `S-${ts}`, type: TerritoryKind.Commerces, congregationId: congId },
    })
    commerceTerritoryId = commerce.id

    for (const [i, homes] of [5, 0, null].entries()) {
      const b = await tx.building.create({
        data: {
          number: `${i + 1}`,
          street: 'Rue Content',
          zip: '75001',
          congregationId: congId,
        },
      })
      await tx.buildingEntrance.create({
        data: {
          kind: EntranceKind.Residential,
          homes,
          congregationId: congId,
          buildings: { connect: { id: b.id } },
          territories: { connect: { id: classicalTerritoryId } },
        },
      })
    }

    for (let i = 0; i < 3; i++) {
      const b = await tx.building.create({
        data: {
          number: `c${i + 1}`,
          street: 'Rue Commerce',
          zip: '75002',
          congregationId: congId,
        },
      })
      await tx.buildingEntrance.create({
        data: {
          kind: EntranceKind.Commerce,
          shopKind: 'food',
          congregationId: congId,
          buildings: { connect: { id: b.id } },
          territories: { connect: { id: commerceTerritoryId } },
        },
      })
    }
  })
})

afterAll(async () => {
  if (congId != null) {
    await withScope(congId, async tx => {
      await tx.buildingAccess.deleteMany({})
      await tx.buildingResidentialData.deleteMany({})
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
      await tx.territory.deleteMany({})
    })
    await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
    await testDb.congregation.deleteMany({ where: { id: congId } })
  }
  await testDb.$disconnect()
})

describe('getTerritoryContent', () => {
  it('aggregates residential homes for a Classical territory (nulls treated as 0)', async () => {
    const result = await withScope(congId, tx => getTerritoryContent(tx as never, classicalTerritoryId))
    expect(result).not.toBeNull()
    expect(result?.kind).toBe(TerritoryKind.Classical)
    expect(result?.entranceCount).toBe(3)
    expect(result?.homes).toBe(5)
    expect(result?.quantity).toBe(5)
  })

  it('counts entrances for a Commerces territory', async () => {
    const result = await withScope(congId, tx => getTerritoryContent(tx as never, commerceTerritoryId))
    expect(result?.entranceCount).toBe(3)
    expect(result?.quantity).toBe(3)
    expect(result?.kind).toBe(TerritoryKind.Commerces)
  })

  it('returns null when the territory does not exist', async () => {
    const result = await withScope(congId, tx => getTerritoryContent(tx as never, 999_999_999))
    expect(result).toBeNull()
  })
})
