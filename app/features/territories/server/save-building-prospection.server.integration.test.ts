import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { BuildingProspectionInput } from '~/features/territories/schemas/building-prospection.schema'
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

const { saveBuildingProspection } = await import('./save-building-prospection.server')

const ts = Date.now()
const ACTOR_ID = 1
let congId: number
let street = 0

function residential(overrides: Partial<BuildingProspectionInput> = {}): BuildingProspectionInput {
  return {
    'has-residential': 'on',
    shopkinds: [],
    'commerce-notes': [],
    'prospection-date': '',
    homes: '',
    phones: '',
    liberals: '',
    access: '',
    'residential-notes': '',
    'shared-entrance-buildings': '',
    ...overrides,
  }
}

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Save prospection ${ts}`, slug: `save-prospection-${ts}`, active: true },
  })
  congId = cong.id
})

afterAll(async () => {
  if (congId) {
    await withScope(congId, async tx => {
      await tx.buildingResidentialData.deleteMany({})
      await tx.buildingAccess.deleteMany({})
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
    })
  }
  await flushPendingAuditWrites()
  await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
  await testDb.congregation.deleteMany({ where: { id: congId } })
  await testDb.$disconnect()
})

/** Buildings on one new street; those given a household count get one residential entrance between them. */
function onNewStreet(...homes: (number | null)[]) {
  street += 1
  return withScope(congId, async tx => {
    const ids: number[] = []
    for (const [index] of homes.entries()) {
      const building = await tx.building.create({
        data: { number: String(index + 1), street: `Rue ${ts}-${street}`, zip: '69100', congregationId: congId },
      })
      ids.push(building.id)
    }
    const counted = ids.filter((_, index) => homes[index] != null)
    if (counted.length > 0) {
      const entrance = await tx.buildingEntrance.create({
        data: {
          kind: EntranceKind.Residential,
          buildings: { connect: counted.map(id => ({ id })) },
          congregationId: congId,
        },
      })
      for (const [index, id] of ids.entries()) {
        const value = homes[index]
        if (value == null) continue
        await tx.buildingResidentialData.create({
          data: { buildingId: id, entranceId: entrance.id, homes: value, congregationId: congId },
        })
      }
    }
    return ids
  })
}

async function separately(...homes: number[]) {
  const ids: number[] = []
  for (const value of homes) ids.push(...(await onNewStreet(value)))
  return ids
}

function residentialEntranceOf(buildingId: number) {
  return withScope(congId, tx =>
    tx.buildingEntrance.findMany({
      where: { kind: EntranceKind.Residential, buildings: { some: { id: buildingId } } },
      include: { buildings: { orderBy: { id: 'asc' } } },
    }),
  )
}

function save(buildingId: number, input: BuildingProspectionInput, sharedWith: number[] | null) {
  return withScope(congId, tx =>
    saveBuildingProspection(tx, { buildingId, congregationId: congId, actorId: ACTOR_ID, input, sharedWith }),
  )
}

describe('saveBuildingProspection (integration)', () => {
  it('links the other buildings and saves the figures in one go', async () => {
    const [own, other] = await separately(4, 6)

    await save(own, residential({ homes: '5', access: '1' }), [other])

    const [entrance] = await residentialEntranceOf(own)
    expect(entrance.buildings.map(({ id }) => id)).toEqual([own, other])
    expect(entrance.homes).toBe(11)
    expect(entrance.access).toBe(1)
    expect((await residentialEntranceOf(other)).map(({ id }) => id)).toEqual([entrance.id])
  })

  it('links the residential entrance it has just created', async () => {
    const [own] = await onNewStreet(null)
    const [other] = await onNewStreet(6)

    await save(own, residential({ homes: '2' }), [other])

    const [entrance] = await residentialEntranceOf(own)
    expect(entrance.buildings.map(({ id }) => id)).toEqual([own, other])
    expect(entrance.homes).toBe(8)
  })

  it('unlinks the buildings left out of the list', async () => {
    const [own, other] = await onNewStreet(4, 6)

    await save(own, residential({ homes: '4' }), [])

    const [entrance] = await residentialEntranceOf(own)
    expect(entrance.buildings.map(({ id }) => id)).toEqual([own])
    expect(entrance.homes).toBe(4)
    const [theirs] = await residentialEntranceOf(other)
    expect(theirs.id).not.toBe(entrance.id)
    expect(theirs.homes).toBe(6)
  })

  it('leaves the links alone for someone who may not change them', async () => {
    const [own, other] = await onNewStreet(4, 6)

    await save(own, residential({ homes: '7' }), null)

    const [entrance] = await residentialEntranceOf(own)
    expect(entrance.buildings.map(({ id }) => id)).toEqual([own, other])
    expect(entrance.homes).toBe(13)
  })

  it('saves nothing when a link fails', async () => {
    const [own] = await onNewStreet(4)

    await expect(save(own, residential({ homes: '9' }), [2_000_000_000])).rejects.toThrow()

    const figures = await testDb.buildingResidentialData.findFirst({ where: { buildingId: own } })
    expect(figures?.homes).toBe(4)
  })
})
