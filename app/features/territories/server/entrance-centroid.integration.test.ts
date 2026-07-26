import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'

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
let buildingAId: number
let buildingBId: number
let buildingCId: number
let entranceId: number

const { updateBuildingsInEntrance } = await import('./update-buildings-in-entrance.server')
const { editBuilding } = await import('./edit-building.server')

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Centroid ${ts}`, slug: `centroid-${ts}`, active: true },
  })
  congId = cong.id

  await withScope(congId, async tx => {
    const a = await tx.building.create({
      data: { number: '1', street: 'Rue A', zip: '75001', latitude: 48.0, longitude: 2.0, congregationId: congId },
    })
    buildingAId = a.id
    const b = await tx.building.create({
      data: { number: '2', street: 'Rue A', zip: '75001', latitude: 48.2, longitude: 2.2, congregationId: congId },
    })
    buildingBId = b.id
    const c = await tx.building.create({
      data: { number: '3', street: 'Rue A', zip: '75001', latitude: 48.4, longitude: 2.4, congregationId: congId },
    })
    buildingCId = c.id

    const entrance = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        congregationId: congId,
        buildings: { connect: [{ id: buildingAId }, { id: buildingBId }] },
        latitude: 48.1,
        longitude: 2.1,
      },
    })
    entranceId = entrance.id
  })
})

afterAll(async () => {
  if (!congId) return
  await withScope(congId, async tx => {
    await tx.buildingResidentialData.deleteMany({})
    await tx.buildingAccess.deleteMany({})
    await tx.buildingEntrance.deleteMany({})
    await tx.building.deleteMany({})
  })
  await testDb.congregation.deleteMany({ where: { id: congId } })
  await testDb.$disconnect()
})

describe('entrance centroid maintenance (integration)', () => {
  it('recomputes the entrance centroid when a building is connected', async () => {
    await withScope(congId, tx =>
      updateBuildingsInEntrance(tx, entranceId, [buildingAId, buildingBId, buildingCId], congId),
    )

    const entrance = await testDb.buildingEntrance.findUnique({ where: { id: entranceId } })
    expect(entrance?.latitude).toBeCloseTo(48.2, 6)
    expect(entrance?.longitude).toBeCloseTo(2.2, 6)
  })

  it('recomputes the entrance centroid when a building is disconnected', async () => {
    await withScope(congId, tx => updateBuildingsInEntrance(tx, entranceId, [buildingAId, buildingBId], congId))

    const entrance = await testDb.buildingEntrance.findUnique({ where: { id: entranceId } })
    expect(entrance?.latitude).toBeCloseTo(48.1, 6)
    expect(entrance?.longitude).toBeCloseTo(2.1, 6)
  })

  it('sets the centroid on the new entrance created for a split building', async () => {
    await withScope(congId, tx => updateBuildingsInEntrance(tx, entranceId, [buildingAId], congId))

    const newEntrance = await testDb.buildingEntrance.findFirst({
      where: { id: { not: entranceId }, congregationId: congId, buildings: { some: { id: buildingBId } } },
    })
    expect(newEntrance?.latitude).toBeCloseTo(48.2, 6)
    expect(newEntrance?.longitude).toBeCloseTo(2.2, 6)

    // Reset for subsequent tests
    await withScope(congId, tx => updateBuildingsInEntrance(tx, entranceId, [buildingAId, buildingBId], congId))
  })

  it('propagates a building coordinate change to its linked entrances via editBuilding', async () => {
    await withScope(congId, tx =>
      editBuilding(tx, buildingAId, congId, {
        address: { number: '1', street: 'Rue A', zip: '75001' },
        coordinates: { latitude: 49.0, longitude: 3.0 },
      }),
    )

    const entrance = await testDb.buildingEntrance.findUnique({ where: { id: entranceId } })
    expect(entrance?.latitude).toBeCloseTo((49.0 + 48.2) / 2, 6)
    expect(entrance?.longitude).toBeCloseTo((3.0 + 2.2) / 2, 6)
  })
})
