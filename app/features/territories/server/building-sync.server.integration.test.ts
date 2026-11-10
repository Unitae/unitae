import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/audit.server')>()),
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
}))

const { completeBuildingSync, failBuildingSync, saveSyncedAddresses, startBuildingSync } = await import(
  './building-sync.server'
)
const { BuildingSyncError, BuildingSyncStatus } = await import('../model/building-sync.type')
const { ConflictError } = await import('~/shared/errors/app-error.server')
const { unscopedDb, withScope } = await import('~/shared/infra/db.server')

const BANO_URL = 'https://bano.openstreetmap.fr/data/bano-93.csv'
const ts = Date.now()
let congregationId: number
let actorId: number

// A square around Les Lilas; (48.88, 2.41) is inside, (48.95, 2.30) is not.
const PERIMETER: [number, number][] = [
  [48.87, 2.4],
  [48.87, 2.43],
  [48.89, 2.43],
  [48.89, 2.4],
]

function address(
  number: string,
  street = 'Rue de Paris',
  latitude: number | null = 48.88,
  longitude: number | null = 2.41,
) {
  return { number, street, zip: '93260', latitude, longitude }
}

function scoped<T>(fn: Parameters<typeof withScope<T>>[1]) {
  return withScope(congregationId, fn)
}

async function setSource(value: string | null) {
  await unscopedDb.setting.deleteMany({ where: { congregationId, key: 'bano-url' } })
  if (value != null) await unscopedDb.setting.create({ data: { key: 'bano-url', value, congregationId } })
}

function building(number: string) {
  return scoped(db => db.building.findFirstOrThrow({ where: { congregationId, number }, include: { entrances: true } }))
}

beforeAll(async () => {
  const congregation = await unscopedDb.congregation.create({
    data: { name: `BuildingSync ${ts}`, slug: `building-sync-${ts}`, active: true },
  })
  congregationId = congregation.id
  const account = await unscopedDb.userAccount.create({
    data: { email: `building-sync-${ts}@test.local`, password: 'x', congregationId },
  })
  actorId = account.id
  await setSource(BANO_URL)
})

afterEach(async () => {
  await scoped(async db => {
    await db.$executeRawUnsafe(
      'DELETE FROM "_BuildingToBuildingEntrance" WHERE "A" IN (SELECT id FROM "Building" WHERE "congregationId" = $1)',
      congregationId,
    )
    await db.buildingEntrance.deleteMany({ where: { congregationId } })
    await db.building.deleteMany({ where: { congregationId } })
    await db.buildingSync.deleteMany({ where: { congregationId } })
  })
  await setSource(BANO_URL)
})

afterAll(async () => {
  await unscopedDb.setting.deleteMany({ where: { congregationId } })
  await unscopedDb.userAccount.deleteMany({ where: { congregationId } })
  await unscopedDb.congregation.delete({ where: { id: congregationId } })
})

describe('startBuildingSync', () => {
  it('starts a run from the congregation’s BANO file, in the name of who asked', async () => {
    const run = await scoped(db => startBuildingSync(db, { congregationId, actorId }))

    expect(run).toMatchObject({
      status: BuildingSyncStatus.Running,
      provider: 'Bano',
      sourceUrl: BANO_URL,
      startedById: actorId,
      progress: 0,
    })
  })

  it('refuses a second run while one is going', async () => {
    await scoped(db => startBuildingSync(db, { congregationId, actorId }))

    const second = scoped(db => startBuildingSync(db, { congregationId, actorId }))

    await expect(second).rejects.toThrow(new ConflictError('building_sync_running'))
  })

  it('takes a run nobody has touched for a long time as interrupted, and starts anew', async () => {
    const stuck = await scoped(db => startBuildingSync(db, { congregationId, actorId }))
    const later = new Date(Date.now() + 60 * 60_000)

    const fresh = await scoped(db => startBuildingSync(db, { congregationId, actorId, now: later }))
    const old = await scoped(db => db.buildingSync.findFirstOrThrow({ where: { id: stuck.id, congregationId } }))

    expect(fresh.id).not.toBe(stuck.id)
    expect(old).toMatchObject({ status: BuildingSyncStatus.Failed, error: BuildingSyncError.Interrupted })
  })

  it('refuses to start without a BANO file', async () => {
    await setSource('')

    await expect(scoped(db => startBuildingSync(db, { congregationId, actorId }))).rejects.toThrow(
      new ConflictError('building_sync_no_source'),
    )
  })
})

describe('saveSyncedAddresses', () => {
  it('creates a new address as a listed building with its own entrance', async () => {
    const run = await scoped(db => startBuildingSync(db, { congregationId, actorId }))

    await scoped(db =>
      saveSyncedAddresses(db, {
        congregationId,
        runStartedAt: run.startedAt,
        perimeter: null,
        addresses: [address('5')],
      }),
    )
    const created = await building('5')

    expect(created).toMatchObject({
      street: 'Rue de Paris',
      streetNormalized: 'rue de paris',
      latitude: 48.88,
      inOpenData: true,
      active: true,
      inTerritory: true,
      lastSeenInSourceAt: run.startedAt,
    })
    expect(created.entrances).toHaveLength(1)
  })

  it('marks a building made by hand as listed, without touching what people set on it', async () => {
    await scoped(db =>
      db.building.create({
        data: { number: '8', street: 'Rue de Paris', zip: '93260', active: false, latitude: 48.8, congregationId },
      }),
    )
    const run = await scoped(db => startBuildingSync(db, { congregationId, actorId }))

    await scoped(db =>
      saveSyncedAddresses(db, {
        congregationId,
        runStartedAt: run.startedAt,
        perimeter: null,
        addresses: [address('8')],
      }),
    )

    expect(await building('8')).toMatchObject({
      active: false,
      latitude: 48.8,
      inOpenData: true,
      lastSeenInSourceAt: run.startedAt,
    })
  })

  it('creates an address outside the perimeter as outside the territory', async () => {
    const run = await scoped(db => startBuildingSync(db, { congregationId, actorId }))

    await scoped(db =>
      saveSyncedAddresses(db, {
        congregationId,
        runStartedAt: run.startedAt,
        perimeter: PERIMETER,
        addresses: [address('1'), address('2', 'Rue Lointaine', 48.95, 2.3)],
      }),
    )

    expect(await building('1')).toMatchObject({ active: true, inTerritory: true })
    expect(await building('2')).toMatchObject({ active: false, inTerritory: false })
  })
})

describe('completeBuildingSync', () => {
  it('stops listing what this run did not find, and counts what it found new and what went missing', async () => {
    const before = new Date(Date.now() - 24 * 60 * 60_000)
    await scoped(db =>
      db.building.createMany({
        data: [
          // Listed last time, listed again.
          {
            number: '1',
            street: 'Rue de Paris',
            zip: '93260',
            inOpenData: true,
            lastSeenInSourceAt: before,
            congregationId,
          },
          // Listed last time, gone from the file.
          {
            number: '2',
            street: 'Rue de Paris',
            zip: '93260',
            inOpenData: true,
            lastSeenInSourceAt: before,
            congregationId,
          },
          // Gone from the file, but already deactivated: not missing work.
          {
            number: '3',
            street: 'Rue de Paris',
            zip: '93260',
            inOpenData: true,
            active: false,
            lastSeenInSourceAt: before,
            congregationId,
          },
          // Made by hand, never in the file.
          { number: '4', street: 'Rue de Paris', zip: '93260', congregationId },
        ],
      }),
    )
    const run = await scoped(db => startBuildingSync(db, { congregationId, actorId }))
    await scoped(db =>
      saveSyncedAddresses(db, {
        congregationId,
        runStartedAt: run.startedAt,
        perimeter: null,
        addresses: [address('1'), address('9'), address('10')],
      }),
    )

    const counts = await scoped(db => completeBuildingSync(db, { runId: run.id, congregationId }))
    const saved = await scoped(db => db.buildingSync.findFirstOrThrow({ where: { id: run.id, congregationId } }))

    expect(counts).toEqual({ createdCount: 2, missingCount: 1 })
    expect((await building('1')).inOpenData).toBe(true)
    expect((await building('2')).inOpenData).toBe(false)
    expect(await building('4')).toMatchObject({ inOpenData: false, lastSeenInSourceAt: null })
    expect(saved).toMatchObject({
      status: BuildingSyncStatus.Completed,
      progress: 100,
      createdCount: 2,
      missingCount: 1,
    })
    expect(saved.finishedAt).toBeInstanceOf(Date)
  })

  it('refuses to complete a run that already ended', async () => {
    const run = await scoped(db => startBuildingSync(db, { congregationId, actorId }))
    await scoped(db => failBuildingSync(db, { runId: run.id, congregationId, error: BuildingSyncError.Unknown }))

    await expect(scoped(db => completeBuildingSync(db, { runId: run.id, congregationId }))).rejects.toThrow(
      new ConflictError('building_sync_not_running'),
    )
  })
})

describe('failBuildingSync', () => {
  it('records why the run failed and leaves the buildings as they were', async () => {
    await scoped(db =>
      db.building.create({
        data: {
          number: '1',
          street: 'Rue de Paris',
          zip: '93260',
          inOpenData: true,
          lastSeenInSourceAt: new Date(),
          congregationId,
        },
      }),
    )
    const run = await scoped(db => startBuildingSync(db, { congregationId, actorId }))

    await scoped(db => failBuildingSync(db, { runId: run.id, congregationId, error: BuildingSyncError.SourceRefused }))
    const saved = await scoped(db => db.buildingSync.findFirstOrThrow({ where: { id: run.id, congregationId } }))

    expect(saved).toMatchObject({ status: BuildingSyncStatus.Failed, error: BuildingSyncError.SourceRefused })
    expect((await building('1')).inOpenData).toBe(true)
  })
})
