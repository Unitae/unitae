import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { ConflictError } from '~/shared/errors/app-error.server'

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
let doorsTerritoryId: number
let phoneTerritoryId: number
let entranceFree: number
let entranceOnDoors: number
let entranceOnPhone: number

const { createTerritory } = await import('./create-territory.server')
const { EntranceTakenError } = await import('./territory-entrances.server')

async function entranceOn(tx: Tx, number: string, territoryId?: number) {
  const building = await tx.building.create({ data: { number, street: 'Rue des Lilas', zip: '69100', congregationId } })
  const entrance = await tx.buildingEntrance.create({
    data: {
      kind: EntranceKind.Residential,
      congregationId,
      buildings: { connect: { id: building.id } },
      ...(territoryId != null ? { territories: { connect: { id: territoryId } } } : {}),
    },
  })
  return entrance.id
}

beforeAll(async () => {
  const congregation = await testDb.congregation.create({
    data: { name: `CT ${ts}`, slug: `ct-${ts}`, active: true },
  })
  congregationId = congregation.id

  await withScope(congregationId, async tx => {
    doorsTerritoryId = (
      await tx.territory.create({ data: { number: `CT-${ts}`, type: TerritoryKindKey.Classical, congregationId } })
    ).id
    phoneTerritoryId = (
      await tx.territory.create({ data: { number: `CT-P-${ts}`, type: TerritoryKindKey.Phone, congregationId } })
    ).id
    entranceFree = await entranceOn(tx, '1')
    entranceOnDoors = await entranceOn(tx, '3', doorsTerritoryId)
    entranceOnPhone = await entranceOn(tx, '5', phoneTerritoryId)
  })
})

afterAll(async () => {
  if (congregationId) {
    await withScope(congregationId, async tx => {
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
      await tx.territory.deleteMany({})
    })
    await testDb.auditLog.deleteMany({ where: { congregationId } })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

function entrancesOf(territoryId: number) {
  return testDb.buildingEntrance
    .findMany({ where: { territories: { some: { id: territoryId } } }, select: { id: true } })
    .then(rows => rows.map(row => row.id).sort())
}

describe('createTerritory (integration)', () => {
  it('creates the territory with its entrances, the number trimmed', async () => {
    const territory = await withScope(congregationId, tx =>
      createTerritory(tx, {
        number: `  NEW-${ts}  `,
        type: TerritoryKindKey.Classical,
        entranceIds: [entranceFree],
        congregationId,
        actorId: 1,
      }),
    )

    expect(territory.number).toBe(`NEW-${ts}`)
    expect(await entrancesOf(territory.id)).toEqual([entranceFree])
  })

  it('refuses a number another territory already uses, whatever its case', async () => {
    await expect(
      withScope(congregationId, tx =>
        createTerritory(tx, {
          number: `ct-${ts}`,
          type: TerritoryKindKey.Classical,
          entranceIds: [],
          congregationId,
          actorId: 1,
        }),
      ),
    ).rejects.toThrow(new ConflictError('territory_number_taken'))
  })

  it('refuses an entrance that is already on a territory of the same type, and says which', async () => {
    const attempt = withScope(congregationId, tx =>
      createTerritory(tx, {
        number: `TAKEN-${ts}`,
        type: TerritoryKindKey.Classical,
        entranceIds: [entranceOnDoors],
        congregationId,
        actorId: 1,
      }),
    )

    await expect(attempt).rejects.toBeInstanceOf(EntranceTakenError)
    await expect(attempt).rejects.toMatchObject({
      entrances: [{ id: entranceOnDoors, address: '3 Rue des Lilas', territoryNumber: `CT-${ts}` }],
    })
    expect(await testDb.territory.count({ where: { number: `TAKEN-${ts}` } })).toBe(0)
  })

  it('takes an entrance from its territory when the reassignment says so', async () => {
    const taken = await withScope(congregationId, tx => entranceOn(tx, '7', doorsTerritoryId))

    const territory = await withScope(congregationId, tx =>
      createTerritory(tx, {
        number: `TAKE-${ts}`,
        type: TerritoryKindKey.Classical,
        entranceIds: [taken],
        reassignments: [{ entranceId: taken, fromTerritoryId: doorsTerritoryId }],
        congregationId,
        actorId: 1,
      }),
    )

    expect(await entrancesOf(territory.id)).toEqual([taken])
    expect(await entrancesOf(doorsTerritoryId)).not.toContain(taken)
  })

  it('accepts an entrance that sits on a territory of another type', async () => {
    const territory = await withScope(congregationId, tx =>
      createTerritory(tx, {
        number: `KIND-${ts}`,
        type: TerritoryKindKey.Classical,
        entranceIds: [entranceOnPhone],
        congregationId,
        actorId: 1,
      }),
    )

    expect(await entrancesOf(territory.id)).toEqual([entranceOnPhone])
    expect(await entrancesOf(phoneTerritoryId)).toEqual([entranceOnPhone])
  })
})
