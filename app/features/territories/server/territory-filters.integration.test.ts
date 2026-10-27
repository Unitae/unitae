/**
 * Runs the `pmr` filter against Postgres. The unit tests pin the shape of the
 * Prisma where-object; this checks what that shape selects on real rows —
 * nullable `isPMR`, `some`/`none` over the m:n entrance relation — and that the
 * filter agrees with `getTerritoryPmrStatus`, the rule behind the badge.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { getTerritoryPmrStatus, PMR_STATUSES } from '~/features/territories/model/pmr-status'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { createTestCongregation } from '~/tests/factories'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {},
}))

const { findTerritoriesWithDetailsPaginated } = await import('./territories.server')
const { computeFilters } = await import('./territory-filters.server')

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

type Entrance = { kind: EntranceKind; isPMR: boolean | null }
const residential = (isPMR: boolean | null): Entrance => ({ kind: EntranceKind.Residential, isPMR })

// One territory per branch of getTerritoryPmrStatus, plus the edge cases.
const FIXTURES: { name: string; type: TerritoryKindKey; entrances: Entrance[] }[] = [
  { name: 'all-pmr', type: TerritoryKindKey.Classical, entrances: [residential(true), residential(true)] },
  { name: 'pmr-and-not', type: TerritoryKindKey.Classical, entrances: [residential(true), residential(false)] },
  { name: 'pmr-and-unknown', type: TerritoryKindKey.Classical, entrances: [residential(true), residential(null)] },
  { name: 'none-pmr', type: TerritoryKindKey.Classical, entrances: [residential(false), residential(false)] },
  { name: 'all-unknown', type: TerritoryKindKey.Classical, entrances: [residential(null), residential(null)] },
  {
    name: 'pmr-plus-shop',
    type: TerritoryKindKey.Classical,
    entrances: [residential(true), { kind: EntranceKind.Commerce, isPMR: false }],
  },
  { name: 'empty', type: TerritoryKindKey.Classical, entrances: [] },
  { name: 'shop-only', type: TerritoryKindKey.Classical, entrances: [{ kind: EntranceKind.Commerce, isPMR: true }] },
  { name: 'commerces-kind', type: TerritoryKindKey.Commerces, entrances: [residential(true)] },
]

let congregationId: number
const nameById = new Map<number, string>()

beforeAll(async () => {
  congregationId = (await createTestCongregation(testDb)).id

  await withScope(congregationId, async tx => {
    for (const [index, fixture] of FIXTURES.entries()) {
      const territory = await tx.territory.create({
        data: { number: `P${String(index).padStart(2, '0')}`, type: fixture.type, congregationId },
      })
      nameById.set(territory.id, fixture.name)
      for (const entrance of fixture.entrances) {
        await tx.buildingEntrance.create({
          data: { ...entrance, congregationId, territories: { connect: { id: territory.id } } },
        })
      }
    }
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.buildingEntrance.deleteMany({})
    await tx.territory.deleteMany({})
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

async function namesMatching(params: Record<string, string>): Promise<string[]> {
  const url = new URL(`https://example.com/?pageSize=50&${new URLSearchParams(params)}`)
  const result = await withScope(congregationId, tx =>
    findTerritoriesWithDetailsPaginated(tx, computeFilters(url.searchParams), url, congregationId),
  )
  return result.territories.map(t => nameById.get(t.id) ?? `unknown:${t.id}`).sort()
}

describe('computeFilters — pmr against Postgres', () => {
  it('full matches only territories whose residential entrances are all PMR', async () => {
    expect(await namesMatching({ pmr: 'full' })).toEqual(['all-pmr', 'pmr-plus-shop'])
  })

  it('partial counts never-checked entrances as not PMR', async () => {
    expect(await namesMatching({ pmr: 'partial' })).toEqual(['pmr-and-not', 'pmr-and-unknown'])
  })

  it('not excludes territories without any residential entrance', async () => {
    expect(await namesMatching({ pmr: 'not' })).toEqual(['all-unknown', 'none-pmr'])
  })

  it('agrees with getTerritoryPmrStatus on every fixture', async () => {
    for (const status of PMR_STATUSES) {
      const expected = FIXTURES.filter(f => getTerritoryPmrStatus(f.type, f.entrances) === status)
        .map(f => f.name)
        .sort()
      expect(await namesMatching({ pmr: status })).toEqual(expected)
    }
  })

  it('combines with the type filter instead of replacing it', async () => {
    expect(await namesMatching({ pmr: 'full', type: TerritoryKindKey.Commerces })).toEqual([])
  })
})
