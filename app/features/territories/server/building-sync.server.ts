import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { pointInPolygon } from '~/shared/utils/point-in-polygon.server'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { BuildingSyncError, BuildingSyncProvider, BuildingSyncStatus } from '../model/building-sync.type'
import { findRunningBuildingSync, staleBefore } from './building-sync.queries'
import type { OpenDataAddress } from './read-open-data.server'

// Arbitrary namespace for the advisory lock that serialises starting a sync, per congregation.
const START_LOCK_NAMESPACE = 0x53594e43

/**
 * Opens a run of the address sync from the congregation's BANO file. One run at a time: a
 * second start while one is going is refused, unless that one went silent long enough to be
 * taken as interrupted.
 */
export async function startBuildingSync(
  db: TransactionClient,
  { congregationId, actorId, now = new Date() }: { congregationId: number; actorId: number; now?: Date },
) {
  const source = await db.setting.findFirst({ where: { key: 'bano-url', congregationId } })
  if (!source?.value) throw new ConflictError('building_sync_no_source')

  // Two clicks at once would both see no running sync without this.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${START_LOCK_NAMESPACE}::int, ${congregationId}::int)`
  if (await findRunningBuildingSync(db, congregationId, now)) throw new ConflictError('building_sync_running')

  await db.buildingSync.updateMany({
    where: { congregationId, status: BuildingSyncStatus.Running, updatedAt: { lt: staleBefore(now) } },
    data: { status: BuildingSyncStatus.Failed, error: BuildingSyncError.Interrupted, finishedAt: now },
  })
  const run = await db.buildingSync.create({
    data: {
      provider: BuildingSyncProvider.Bano,
      sourceUrl: source.value,
      startedAt: now,
      startedById: actorId,
      congregationId,
    },
  })

  audit({
    action: AuditAction.BuildingSyncStarted,
    congregationId,
    actorId,
    entityType: 'BuildingSync',
    entityId: run.id,
    metadata: { provider: run.provider },
  })
  return run
}

/** Saves how far a running sync got. Also its heartbeat: see BUILDING_SYNC_STALE_AFTER_MS. */
export async function recordBuildingSyncProgress(
  db: TransactionClient,
  { runId, congregationId, progress }: { runId: number; congregationId: number; progress: number },
) {
  await db.buildingSync.updateMany({
    where: { id: runId, congregationId, status: BuildingSyncStatus.Running },
    data: { progress },
  })
}

interface SaveSyncedAddressesParams {
  congregationId: number
  runStartedAt: Date
  addresses: OpenDataAddress[]
  /** The congregation's perimeter as [lat, lng] pairs; null when none is drawn. */
  perimeter: [number, number][] | null
}

/**
 * Writes one batch of the source's addresses: each one is marked as listed by this run. A new
 * address becomes a building with its own residential entrance, active when it falls inside the
 * perimeter. An existing building keeps what people set on it (active, position, notes); only
 * whether it lies inside the perimeter is refreshed.
 */
export async function saveSyncedAddresses(
  db: TransactionClient,
  { congregationId, runStartedAt, addresses, perimeter }: SaveSyncedAddressesParams,
) {
  const key = (a: { number: string; street: string; zip: string }) => `${a.number}\u0000${a.street}\u0000${a.zip}`
  const existing = await db.building.findMany({
    where: {
      congregationId,
      zip: { in: [...new Set(addresses.map(a => a.zip))] },
      street: { in: [...new Set(addresses.map(a => a.street))] },
    },
    select: { id: true, number: true, street: true, zip: true },
  })
  const idByKey = new Map(existing.map(b => [key(b), b.id]))

  const inside = (a: OpenDataAddress) =>
    perimeter == null ||
    (a.latitude != null && a.longitude != null && pointInPolygon([a.latitude, a.longitude], perimeter))

  const seen = { inside: [] as number[], outside: [] as number[] }
  for (const address of addresses) {
    const id = idByKey.get(key(address))
    const isInside = inside(address)
    if (id != null) {
      seen[isInside ? 'inside' : 'outside'].push(id)
      continue
    }
    await db.building.create({
      data: {
        number: address.number,
        street: address.street,
        streetNormalized: stripDiacritics(address.street),
        zip: address.zip,
        latitude: address.latitude,
        longitude: address.longitude,
        inOpenData: true,
        lastSeenInSourceAt: runStartedAt,
        active: isInside,
        inTerritory: isInside,
        entrances: {
          create: {
            kind: EntranceKind.Residential,
            latitude: address.latitude,
            longitude: address.longitude,
            congregation: { connect: { id: congregationId } },
          },
        },
        congregation: { connect: { id: congregationId } },
      },
    })
  }

  for (const [ids, inTerritory] of [
    [seen.inside, true],
    [seen.outside, false],
  ] as const) {
    if (ids.length === 0) continue
    await db.building.updateMany({
      where: { id: { in: ids }, congregationId },
      data: { inOpenData: true, lastSeenInSourceAt: runStartedAt, inTerritory },
    })
  }
}

/**
 * Closes a run once every address is saved: buildings a sync listed before and this run did not
 * stop being listed. Returns the buildings the run created and the active buildings now missing
 * from the source (the « Manquants » total).
 */
export async function completeBuildingSync(
  db: TransactionClient,
  { runId, congregationId, now = new Date() }: { runId: number; congregationId: number; now?: Date },
) {
  const run = await db.buildingSync.findFirst({ where: { id: runId, congregationId } })
  if (run?.status !== BuildingSyncStatus.Running) throw new ConflictError('building_sync_not_running')

  await db.building.updateMany({
    where: {
      congregationId,
      inOpenData: true,
      OR: [{ lastSeenInSourceAt: { lt: run.startedAt } }, { lastSeenInSourceAt: null }],
    },
    data: { inOpenData: false },
  })
  const createdCount = await db.building.count({
    where: { congregationId, lastSeenInSourceAt: run.startedAt, createdAt: { gte: run.startedAt } },
  })
  const missingCount = await db.building.count({
    where: { congregationId, active: true, lastSeenInSourceAt: { lt: run.startedAt } },
  })

  await db.buildingSync.update({
    where: { id_congregationId: { id: runId, congregationId } },
    data: { status: BuildingSyncStatus.Completed, progress: 100, finishedAt: now, createdCount, missingCount },
  })
  audit({
    action: AuditAction.BuildingSyncCompleted,
    congregationId,
    actorId: run.startedById ?? undefined,
    entityType: 'BuildingSync',
    entityId: runId,
    metadata: { createdCount, missingCount },
  })
  return { createdCount, missingCount }
}

/** Closes a run that could not finish. Buildings keep what earlier batches wrote; nothing is reset. */
export async function failBuildingSync(
  db: TransactionClient,
  {
    runId,
    congregationId,
    error,
    now = new Date(),
  }: { runId: number; congregationId: number; error: BuildingSyncError; now?: Date },
) {
  const { count } = await db.buildingSync.updateMany({
    where: { id: runId, congregationId, status: BuildingSyncStatus.Running },
    data: { status: BuildingSyncStatus.Failed, error, finishedAt: now },
  })
  if (count === 0) return
  audit({
    action: AuditAction.BuildingSyncFailed,
    congregationId,
    entityType: 'BuildingSync',
    entityId: runId,
    metadata: { error },
  })
}
