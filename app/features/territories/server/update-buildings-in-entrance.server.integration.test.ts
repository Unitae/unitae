import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
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

const { updateBuildingsInEntrance } = await import('./update-buildings-in-entrance.server')

const ts = Date.now()
const ACTOR_ID = 1
let congId: number
let territoryId: number
let otherTerritoryId: number
let street = 0

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Entrance sharing ${ts}`, slug: `entrance-sharing-${ts}`, active: true },
  })
  congId = cong.id
  await withScope(congId, async tx => {
    territoryId = (await tx.territory.create({ data: { number: '14', congregationId: congId } })).id
    otherTerritoryId = (await tx.territory.create({ data: { number: '15', congregationId: congId } })).id
  })
})

afterAll(async () => {
  if (congId) {
    await withScope(congId, async tx => {
      await tx.buildingResidentialData.deleteMany({})
      await tx.buildingAccess.deleteMany({})
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
      await tx.territory.deleteMany({})
    })
  }
  await flushPendingAuditWrites()
  await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
  await testDb.congregation.deleteMany({ where: { id: congId } })
  await testDb.$disconnect()
})

interface Shared {
  homes: number[]
  notes?: string
  access?: number
  territory?: number
}

/** One residential entrance shared by new buildings, each with its own household count. */
function sharedEntrance({ homes, notes = '', access, territory = territoryId }: Shared) {
  street += 1
  return withScope(congId, async tx => {
    const buildings = []
    for (const [index] of homes.entries()) {
      buildings.push(
        await tx.building.create({
          data: {
            number: String(index + 1),
            street: `Rue ${ts}-${street}`,
            zip: '69100',
            latitude: 45 + index / 100,
            longitude: 4 + index / 100,
            congregationId: congId,
          },
        }),
      )
    }
    const entrance = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        notes,
        access: access ?? null,
        homes: homes.reduce((sum, value) => sum + value, 0),
        buildings: { connect: buildings.map(({ id }) => ({ id })) },
        territories: { connect: { id: territory } },
        congregationId: congId,
      },
    })
    if (access != null) {
      await tx.buildingAccess.create({
        data: { entranceId: entrance.id, type: access, position: 0, congregationId: congId },
      })
    }
    for (const [index, building] of buildings.entries()) {
      await tx.buildingResidentialData.create({
        data: { buildingId: building.id, entranceId: entrance.id, homes: homes[index], congregationId: congId },
      })
    }
    return { entranceId: entrance.id, buildingIds: buildings.map(({ id }) => id) }
  })
}

function residentialEntrancesOf(buildingId: number) {
  return withScope(congId, tx =>
    tx.buildingEntrance.findMany({
      where: { kind: EntranceKind.Residential, buildings: { some: { id: buildingId } } },
      include: { territories: true, accesses: true, buildings: true },
    }),
  )
}

function entrance(id: number) {
  return withScope(congId, tx => tx.buildingEntrance.findFirst({ where: { id }, include: { buildings: true } }))
}

describe('updateBuildingsInEntrance (integration)', () => {
  it('takes a building it links out of its own residential entrance, households included', async () => {
    const target = await sharedEntrance({ homes: [4] })
    const joining = await sharedEntrance({ homes: [6], territory: otherTerritoryId })
    const [joiningId] = joining.buildingIds

    await withScope(congId, tx =>
      updateBuildingsInEntrance(tx, target.entranceId, [...target.buildingIds, joiningId], congId, ACTOR_ID),
    )

    const entrances = await residentialEntrancesOf(joiningId)
    expect(entrances.map(({ id }) => id)).toEqual([target.entranceId])
    expect(entrances[0].homes).toBe(10)
    expect(await entrance(joining.entranceId)).toBeNull()
    const figures = await testDb.buildingResidentialData.findFirst({ where: { buildingId: joiningId } })
    expect(figures?.entranceId).toBe(target.entranceId)
  })

  it('leaves the other buildings of the former shared entrance where they were', async () => {
    const target = await sharedEntrance({ homes: [4] })
    const former = await sharedEntrance({ homes: [6, 3] })
    const [joiningId, stayingId] = former.buildingIds

    await withScope(congId, tx =>
      updateBuildingsInEntrance(tx, target.entranceId, [...target.buildingIds, joiningId], congId, ACTOR_ID),
    )

    const left = await entrance(former.entranceId)
    expect(left?.buildings.map(({ id }) => id)).toEqual([stayingId])
    expect(left?.homes).toBe(3)
    expect(left?.latitude).toBeCloseTo(45.01)
    expect((await entrance(target.entranceId))?.homes).toBe(10)
  })

  it('gives a building it unlinks its own entrance, with the notes, access and territory', async () => {
    const shared = await sharedEntrance({ homes: [4, 6], notes: 'Digicode 4712B', access: 2 })
    const [stayingId, leavingId] = shared.buildingIds

    await withScope(congId, tx => updateBuildingsInEntrance(tx, shared.entranceId, [stayingId], congId, ACTOR_ID))

    const [own] = await residentialEntrancesOf(leavingId)
    expect(own.id).not.toBe(shared.entranceId)
    expect(own.notes).toBe('Digicode 4712B')
    expect(own.access).toBe(2)
    expect(own.accesses.map(({ type }) => type)).toEqual([2])
    expect(own.territories.map(({ id }) => id)).toEqual([territoryId])
    expect(own.homes).toBe(6)
    expect((await entrance(shared.entranceId))?.homes).toBe(4)
  })

  it('fails instead of logging when a building cannot be linked', async () => {
    const target = await sharedEntrance({ homes: [4] })

    await expect(
      withScope(congId, tx =>
        updateBuildingsInEntrance(tx, target.entranceId, [...target.buildingIds, 2_000_000_000], congId, ACTOR_ID),
      ),
    ).rejects.toThrow()
  })
})
