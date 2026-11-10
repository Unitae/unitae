/**
 * The BANO sync, end to end against a real database. Only the network is faked:
 * DNS resolves to a public address and `fetch` answers with a CSV stream, so the
 * job runs the same code path it runs in production.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))
vi.mock('~/shared/domain/audit.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/audit.server')>()),
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
}))
const notified: { type: string; payload?: Record<string, unknown> }[] = []
vi.mock('~/features/notifications/index.server', () => ({
  notify: (_db: unknown, params: { type: string; payload?: Record<string, unknown> }) => {
    notified.push(params)
    return Promise.resolve()
  },
}))

const { handleSyncWork } = await import('./handle-sync-work.server')
const { startBuildingSync } = await import('../server/building-sync.server')
const { unscopedDb, withScope } = await import('~/shared/infra/db.server')

const BANO_URL = 'https://bano.openstreetmap.fr/data/bano-93.csv'
const ts = Date.now()
let congregationId: number
let userId: number
const originalFetch = globalThis.fetch

function banoRow(i: number, zip: string) {
  return `93${i},${i},Rue Synchro ${zip},${zip},Ville,OSM,48.88,2.41\n`
}

/** A CSV body delivered in `chunks` pieces, one every `everyMs`, that stops when fetch is aborted. */
function slowCsv(lines: string[], chunks: number, everyMs: number, signal?: AbortSignal | null) {
  const perChunk = Math.ceil(lines.length / chunks)
  let sent = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        controller.error(signal.reason)
      })
    },
    pull(controller) {
      return new Promise<void>(resolve => {
        timer = setTimeout(() => {
          const piece = lines.slice(sent, sent + perChunk)
          sent += perChunk
          if (piece.length > 0) controller.enqueue(new TextEncoder().encode(piece.join('')))
          if (sent >= lines.length) controller.close()
          resolve()
        }, everyMs)
      })
    },
  })
}

function serve(respond: (signal?: AbortSignal | null) => Response) {
  globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => respond(init?.signal)) as typeof fetch
}

function job(runId?: number) {
  return {
    id: `sync-test-${ts}`,
    // Without a run: the shape of jobs queued before runs were recorded.
    data: { userId, congregationId, ...(runId == null ? {} : { runId }) },
    attemptsMade: 0,
    updateProgress: vi.fn(async () => {}),
  }
}

async function runJob(runId?: number) {
  try {
    await handleSyncWork(job(runId) as never)
    return null
  } catch (error) {
    return error
  }
}

function startRun() {
  return withScope(congregationId, db => startBuildingSync(db, { congregationId, actorId: userId }))
}

function latestRun() {
  return withScope(congregationId, db =>
    db.buildingSync.findFirstOrThrow({ where: { congregationId }, orderBy: { id: 'desc' } }),
  )
}

beforeAll(async () => {
  const congregation = await unscopedDb.congregation.create({
    data: { name: `Sync ${ts}`, slug: `sync-${ts}`, active: true },
  })
  congregationId = congregation.id
  const account = await unscopedDb.userAccount.create({
    data: { email: `sync-${ts}@test.local`, password: 'x', congregationId },
  })
  userId = account.id
  await unscopedDb.setting.createMany({
    data: [
      { key: 'bano-url', value: BANO_URL, congregationId },
      { key: 'zips', value: '["93260"]', congregationId },
    ],
  })
})

beforeEach(() => {
  notified.length = 0
})

afterEach(async () => {
  globalThis.fetch = originalFetch
  await withScope(congregationId, async tx => {
    await tx.$executeRawUnsafe(
      'DELETE FROM "_BuildingToBuildingEntrance" WHERE "A" IN (SELECT id FROM "Building" WHERE "congregationId" = $1)',
      congregationId,
    )
    await tx.buildingEntrance.deleteMany({ where: { congregationId } })
    await tx.building.deleteMany({ where: { congregationId } })
    await tx.buildingSync.deleteMany({ where: { congregationId } })
  })
})

afterAll(async () => {
  await unscopedDb.setting.deleteMany({ where: { congregationId } })
  await unscopedDb.userAccount.deleteMany({ where: { congregationId } })
  await unscopedDb.congregation.delete({ where: { id: congregationId } })
})

describe('handleSyncWork — BANO sync against the database', () => {
  it('saves the addresses of a file that takes longer than five seconds to arrive', async () => {
    const lines: string[] = []
    for (let i = 1; i <= 600; i++) {
      lines.push(banoRow(i, '93260'), banoRow(i, '93100'))
    }
    serve(signal => new Response(slowCsv(lines, 60, 100, signal), { status: 200 }))

    const error = await runJob()
    const saved = await withScope(congregationId, tx => tx.building.count({ where: { congregationId, zip: '93260' } }))

    expect(saved).toBe(600)
    expect(error).toBeNull()
  }, 30_000)

  it('leaves every building as it was when the BANO answers with an error', async () => {
    await withScope(congregationId, tx =>
      tx.building.create({
        data: { number: '1', street: 'Rue Existante', zip: '93260', inOpenData: true, congregationId },
      }),
    )
    serve(() => new Response('Service Unavailable', { status: 503 }))

    await runJob()
    const kept = await withScope(congregationId, tx => tx.building.findFirst({ where: { congregationId } }))

    expect(kept?.inOpenData).toBe(true)
    expect(notified.map(n => n.type)).not.toContain('territory.sync.completed')
  })

  it('closes the run and tells who started it what is new and what went missing', async () => {
    await withScope(congregationId, tx =>
      tx.building.create({
        data: {
          number: '999',
          street: 'Rue Disparue',
          zip: '93260',
          inOpenData: true,
          lastSeenInSourceAt: new Date(Date.now() - 86_400_000),
          congregationId,
        },
      }),
    )
    serve(() => new Response(banoRow(1, '93260') + banoRow(2, '93260') + banoRow(3, '93100'), { status: 200 }))
    const run = await startRun()

    expect(await runJob(run.id)).toBeNull()

    expect(await latestRun()).toMatchObject({ id: run.id, status: 'Completed', createdCount: 2, missingCount: 1 })
    expect(notified).toEqual([
      expect.objectContaining({ type: 'territory.sync.completed', payload: { created: 2, missing: 1 } }),
    ])
  })

  it('closes the run as refused when the BANO answers with an error, and says so', async () => {
    serve(() => new Response('Service Unavailable', { status: 503 }))
    const run = await startRun()

    await runJob(run.id)

    expect(await latestRun()).toMatchObject({ id: run.id, status: 'Failed', error: 'SourceRefused' })
    expect(notified).toEqual([
      expect.objectContaining({ type: 'territory.sync.failed', payload: { reason: 'SourceRefused' } }),
    ])
  })

  it('fails, and keeps every building listed, when the file has no address in the congregation’s postcodes', async () => {
    await withScope(congregationId, tx =>
      tx.building.create({
        data: {
          number: '1',
          street: 'Rue Existante',
          zip: '93260',
          inOpenData: true,
          lastSeenInSourceAt: new Date(),
          congregationId,
        },
      }),
    )
    serve(() => new Response(banoRow(1, '75001'), { status: 200 }))
    const run = await startRun()

    await runJob(run.id)
    const kept = await withScope(congregationId, tx => tx.building.findFirst({ where: { congregationId } }))

    expect(await latestRun()).toMatchObject({ status: 'Failed', error: 'NoMatchingAddress' })
    expect(kept?.inOpenData).toBe(true)
  })

  it('does nothing for a run that has already ended', async () => {
    serve(() => new Response(banoRow(1, '93260'), { status: 200 }))
    const run = await startRun()
    await withScope(congregationId, db =>
      db.buildingSync.update({ where: { id: run.id }, data: { status: 'Completed', finishedAt: new Date() } }),
    )

    expect(await runJob(run.id)).toBeNull()

    expect(await withScope(congregationId, tx => tx.building.count({ where: { congregationId } }))).toBe(0)
  })
})
