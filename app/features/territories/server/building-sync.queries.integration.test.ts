import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BuildingSyncProvider, BuildingSyncStatus } from '../model/building-sync.type'
import { BUILDING_SYNC_STALE_AFTER_MS, findRunningBuildingSync } from './building-sync.queries'

const { unscopedDb, withScope } = await import('~/shared/infra/db.server')

const ts = Date.now()
let congregationId: number

function run(status: BuildingSyncStatus) {
  return withScope(congregationId, db =>
    db.buildingSync.create({
      data: {
        provider: BuildingSyncProvider.Bano,
        sourceUrl: 'https://bano.openstreetmap.fr/data/bano-93.csv',
        status,
        congregationId,
      },
    }),
  )
}

function running(now?: Date) {
  return withScope(congregationId, db => findRunningBuildingSync(db, congregationId, now))
}

beforeAll(async () => {
  const congregation = await unscopedDb.congregation.create({
    data: { name: `SyncQueries ${ts}`, slug: `sync-queries-${ts}`, active: true },
  })
  congregationId = congregation.id
})

afterEach(async () => {
  await withScope(congregationId, db => db.buildingSync.deleteMany({ where: { congregationId } }))
})

afterAll(async () => {
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
