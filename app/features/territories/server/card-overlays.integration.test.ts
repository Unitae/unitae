import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'

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
let aOverlayId: number

const { createCardOverlay, listCardOverlays } = await import('./card-overlays.server')

const SAMPLE_PATHS = [
  { lat: 45.75, lng: 4.83 },
  { lat: 45.76, lng: 4.84 },
  { lat: 45.77, lng: 4.85 },
  { lat: 45.75, lng: 4.83 },
]

beforeAll(async () => {
  const a = await testDb.congregation.create({
    data: { name: `Overlay A ${ts}`, slug: `overlay-a-${ts}`, active: true },
  })
  aId = a.id
  const b = await testDb.congregation.create({
    data: { name: `Overlay B ${ts}`, slug: `overlay-b-${ts}`, active: true },
  })
  bId = b.id

  await withScope(aId, async tx => {
    const created = await createCardOverlay(tx as never, {
      name: 'Zone A',
      color: '#C2175B',
      paths: SAMPLE_PATHS,
      congregationId: aId,
      actorId: 0,
    })
    aOverlayId = created.id
  })
})

afterAll(async () => {
  for (const cid of [aId, bId]) {
    if (cid == null) continue
    await withScope(cid, async tx => {
      await tx.territoryCardOverlay.deleteMany({})
    })
  }
  // Drain fire-and-forget audit writes so the deleteMany below clears them all,
  // otherwise an in-flight write can land after cleanup and break the congregation FK.
  await flushPendingAuditWrites()
  await testDb.auditLog.deleteMany({ where: { congregationId: { in: [aId, bId] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [aId, bId] } } })
  await testDb.$disconnect()
})

describe('TerritoryCardOverlay RLS isolation', () => {
  it("rend l'overlay visible uniquement dans la congrégation propriétaire", async () => {
    const aOverlays = await withScope(aId, tx => listCardOverlays(tx as never))
    expect(aOverlays.map(o => o.id)).toContain(aOverlayId)

    const bOverlays = await withScope(bId, tx => listCardOverlays(tx as never))
    expect(bOverlays.map(o => o.id)).not.toContain(aOverlayId)
    expect(bOverlays).toHaveLength(0)
  })

  it('permet à chaque congrégation de gérer ses propres overlays', async () => {
    await withScope(bId, async tx => {
      const created = await createCardOverlay(tx as never, {
        name: 'Zone B',
        color: '#0E9A6C',
        paths: SAMPLE_PATHS,
        congregationId: bId,
        actorId: 0,
      })
      const list = await listCardOverlays(tx as never)
      expect(list.map(o => o.id)).toContain(created.id)
    })

    const aOverlays = await withScope(aId, tx => listCardOverlays(tx as never))
    expect(aOverlays.every(o => o.name !== 'Zone B')).toBe(true)
  })
})
