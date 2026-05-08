import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

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
let aId: number
let bId: number

const { clearPerimeter, getPerimeter, getPerimeterPaths, setPerimeter } = await import('./perimeter.server')

const SAMPLE_PATHS = [
  { lat: 45.75, lng: 4.83 },
  { lat: 45.76, lng: 4.84 },
  { lat: 45.77, lng: 4.85 },
  { lat: 45.75, lng: 4.83 },
]

beforeAll(async () => {
  const a = await testDb.congregation.create({ data: { name: `Perim A ${ts}`, slug: `perim-a-${ts}`, active: true } })
  aId = a.id
  const b = await testDb.congregation.create({ data: { name: `Perim B ${ts}`, slug: `perim-b-${ts}`, active: true } })
  bId = b.id
})

afterAll(async () => {
  for (const cid of [aId, bId]) {
    if (cid == null) continue
    await withScope(cid, async tx => {
      await tx.territoryPerimeter.deleteMany({})
    })
  }
  await testDb.auditLog.deleteMany({ where: { congregationId: { in: [aId, bId] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [aId, bId] } } })
  await testDb.$disconnect()
})

describe('TerritoryPerimeter', () => {
  it("retourne null quand aucun périmètre n'est défini", async () => {
    const result = await withScope(aId, tx => getPerimeter(tx as never))
    expect(result).toBeNull()
  })

  it('upsert et lit le périmètre dans la même congrégation', async () => {
    await withScope(aId, async tx => {
      await setPerimeter(tx as never, { paths: SAMPLE_PATHS, congregationId: aId, actorId: 0 })
    })
    const fetched = await withScope(aId, tx => getPerimeterPaths(tx as never))
    expect(fetched).toEqual(SAMPLE_PATHS)
  })

  it('isole les périmètres par congrégation (RLS)', async () => {
    const seen = await withScope(bId, tx => getPerimeter(tx as never))
    expect(seen).toBeNull()

    const otherPaths = SAMPLE_PATHS.map(p => ({ lat: p.lat + 1, lng: p.lng + 1 }))
    await withScope(bId, async tx => {
      await setPerimeter(tx as never, { paths: otherPaths, congregationId: bId, actorId: 0 })
    })

    const aPaths = await withScope(aId, tx => getPerimeterPaths(tx as never))
    expect(aPaths).toEqual(SAMPLE_PATHS)
  })

  it('clearPerimeter supprime le périmètre courant et journalise', async () => {
    const removed = await withScope(aId, tx => clearPerimeter(tx as never, aId, 0))
    expect(removed).toBe(true)

    const after = await withScope(aId, tx => getPerimeter(tx as never))
    expect(after).toBeNull()

    const removedAgain = await withScope(aId, tx => clearPerimeter(tx as never, aId, 0))
    expect(removedAgain).toBe(false)
  })
})
