import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BuildingSyncError, BuildingSyncProvider, BuildingSyncStatus } from '../model/building-sync.type'
import {
  BUILDING_SYNC_STALE_AFTER_MS,
  findRunningBuildingSync,
  getBuildingSyncFacts,
  getBuildingSyncStatus,
} from './building-sync.queries'

const { unscopedDb, withScope } = await import('~/shared/infra/db.server')

const ts = Date.now()
let congregationId: number

function run(status: BuildingSyncStatus, data: Record<string, unknown> = {}) {
  return withScope(congregationId, db =>
    db.buildingSync.create({
      data: {
        provider: BuildingSyncProvider.Bano,
        sourceUrl: 'https://bano.openstreetmap.fr/data/bano-93.csv',
        status,
        congregationId,
        ...data,
      },
    }),
  )
}

function status(now?: Date) {
  return withScope(congregationId, db => getBuildingSyncStatus(db, congregationId, now))
}

function running(now?: Date) {
  return withScope(congregationId, db => findRunningBuildingSync(db, congregationId, now))
}

let starterId: number

beforeAll(async () => {
  const congregation = await unscopedDb.congregation.create({
    data: { name: `SyncQueries ${ts}`, slug: `sync-queries-${ts}`, active: true },
  })
  congregationId = congregation.id
  const account = await unscopedDb.userAccount.create({
    data: {
      email: `sync-queries-${ts}@test.local`,
      password: 'x',
      firstname: 'Marc',
      lastname: 'DUPONT',
      congregationId,
    },
  })
  starterId = account.id
})

afterEach(async () => {
  await withScope(congregationId, db => db.buildingSync.deleteMany({ where: { congregationId } }))
})

afterAll(async () => {
  await unscopedDb.setting.deleteMany({ where: { congregationId } })
  await unscopedDb.territoryPerimeter.deleteMany({ where: { congregationId } })
  await unscopedDb.userAccount.deleteMany({ where: { congregationId } })
  await unscopedDb.congregation.delete({ where: { id: congregationId } })
})

describe('findRunningBuildingSync', () => {
  it('finds the sync that is going', async () => {
    const going = await run(BuildingSyncStatus.Running)

    expect((await running())?.id).toBe(going.id)
  })

  it('ignores syncs that have ended', async () => {
    await run(BuildingSyncStatus.Completed)
    await run(BuildingSyncStatus.Failed)

    expect(await running()).toBeNull()
  })

  it('ignores a running sync that has been silent for too long', async () => {
    await run(BuildingSyncStatus.Running)
    const later = new Date(Date.now() + BUILDING_SYNC_STALE_AFTER_MS + 60_000)

    expect(await running(later)).toBeNull()
  })
})

describe('getBuildingSyncStatus', () => {
  it('has nothing to say before the first sync', async () => {
    expect(await status()).toEqual({ latest: null, lastCompleted: null })
  })

  it('gives the run going and the last one that completed, with who started it and what it found', async () => {
    await run(BuildingSyncStatus.Completed, {
      startedAt: new Date('2026-11-03T09:00:00Z'),
      finishedAt: new Date('2026-11-03T09:04:00Z'),
      createdCount: 12,
      missingCount: 4,
      startedById: starterId,
    })
    await run(BuildingSyncStatus.Running, { progress: 40, startedById: starterId })

    const { latest, lastCompleted } = await status()

    expect(latest).toMatchObject({ status: BuildingSyncStatus.Running, progress: 40, startedBy: 'Marc DUPONT' })
    expect(lastCompleted).toMatchObject({
      status: BuildingSyncStatus.Completed,
      createdCount: 12,
      missingCount: 4,
      startedBy: 'Marc DUPONT',
    })
  })

  it('reads a running sync silent for too long as interrupted', async () => {
    await run(BuildingSyncStatus.Running)
    const later = new Date(Date.now() + BUILDING_SYNC_STALE_AFTER_MS + 60_000)

    expect((await status(later)).latest).toMatchObject({
      status: BuildingSyncStatus.Failed,
      error: BuildingSyncError.Interrupted,
    })
  })

  it('says why the last sync failed', async () => {
    await run(BuildingSyncStatus.Failed, { error: BuildingSyncError.SourceRefused, finishedAt: new Date() })

    expect((await status()).latest).toMatchObject({
      status: BuildingSyncStatus.Failed,
      error: BuildingSyncError.SourceRefused,
      startedBy: null,
    })
  })
})

describe('getBuildingSyncFacts', () => {
  const facts = () => withScope(congregationId, db => getBuildingSyncFacts(db, congregationId))

  it('knows nothing until the territory settings are filled in', async () => {
    expect(await facts()).toEqual({ sourceUrl: null, zips: [], perimeter: false })
  })

  it('reads an emptied postcode field as no postcode', async () => {
    await unscopedDb.setting.create({ data: { key: 'zips', value: '[""]', congregationId } })
    expect((await facts()).zips).toEqual([])
    await unscopedDb.setting.deleteMany({ where: { congregationId, key: 'zips' } })
  })

  it('reads the file, the postcodes and whether a perimeter is drawn', async () => {
    await unscopedDb.setting.createMany({
      data: [
        { key: 'bano-url', value: 'https://bano.openstreetmap.fr/data/bano-93.csv', congregationId },
        { key: 'zips', value: '["93310","93260"]', congregationId },
      ],
    })
    await unscopedDb.territoryPerimeter.create({ data: { paths: [{ lat: 48.88, lng: 2.41 }], congregationId } })

    expect(await facts()).toEqual({
      sourceUrl: 'https://bano.openstreetmap.fr/data/bano-93.csv',
      zips: ['93260', '93310'],
      perimeter: true,
    })
  })
})
