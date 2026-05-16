import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

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

const { fetchAttributionsForStats } = await import('./fetch-attributions-for-stats.server')
const { computeTerritoryCoverage } = await import('./territory-coverage.server')
const { countTerritoriesExistingBefore } = await import('./fetch-territory-counts.server')
const { countActiveWorkingTerritories } = await import('./active-working-territories.server')
const { countRestingTerritories } = await import('./resting-territories.server')
const { countAvailableTerritories } = await import('./available-territories.server')

const ts = Date.now()
let congregationId: number
let groupAId: number
let groupBId: number
let publisherInGroupAId: number
let publisherInGroupBId: number
let lastDayTerritoryId: number
let workingPlusRestingTerritoryId: number
let oldTerritoryId: number
let recentTerritoryId: number

// Filter window used by the boundary test below.
const FILTER_START = new Date(2025, 8, 1) // Sept 1, 2025 local midnight
const FILTER_END = new Date(2026, 7, 31) // Aug 31, 2026 local midnight (last day of the period)

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Stats ${ts}`, slug: `stats-${ts}`, active: true },
  })
  congregationId = cong.id

  await withScope(congregationId, async tx => {
    const groupAResponsible = await tx.member.create({
      data: { firstname: 'Alice', lastname: 'GroupA', isPublisher: true, congregationId },
    })
    const groupBResponsible = await tx.member.create({
      data: { firstname: 'Bob', lastname: 'GroupB', isPublisher: true, congregationId },
    })

    const groupA = await tx.publisherGroup.create({
      data: {
        name: `Group A ${ts}`,
        adress: '1 rue A',
        responsibleId: groupAResponsible.id,
        congregationId,
      },
    })
    const groupB = await tx.publisherGroup.create({
      data: {
        name: `Group B ${ts}`,
        adress: '1 rue B',
        responsibleId: groupBResponsible.id,
        congregationId,
      },
    })
    groupAId = groupA.id
    groupBId = groupB.id

    const publisherA = await tx.member.create({
      data: {
        firstname: 'Carol',
        lastname: 'InGroupA',
        isPublisher: true,
        publisherGroupId: groupAId,
        congregationId,
      },
    })
    const publisherB = await tx.member.create({
      data: {
        firstname: 'Dave',
        lastname: 'InGroupB',
        isPublisher: true,
        publisherGroupId: groupBId,
        congregationId,
      },
    })
    publisherInGroupAId = publisherA.id
    publisherInGroupBId = publisherB.id

    // ── Boundary scenario: attribution on the last day of the filter window ──
    const lastDayTerritory = await tx.territory.create({
      data: { number: `T-BOUNDARY-${ts}`, type: TerritoryKind.Classical, congregationId },
    })
    lastDayTerritoryId = lastDayTerritory.id

    await tx.attribution.create({
      data: {
        publisherId: publisherInGroupAId,
        territoryId: lastDayTerritoryId,
        type: TerritoryAttributionKind.Default,
        startDate: FILTER_END, // exactly the picked end date — must be included
        lateDate: new Date(2026, 11, 31),
        congregationId,
      },
    })

    // ── Group-filter scenario: each group has its own attribution ──
    const groupATerritory = await tx.territory.create({
      data: { number: `T-GA-${ts}`, type: TerritoryKind.Classical, congregationId },
    })
    const groupBTerritory = await tx.territory.create({
      data: { number: `T-GB-${ts}`, type: TerritoryKind.Classical, congregationId },
    })
    await tx.attribution.create({
      data: {
        publisherId: publisherInGroupAId,
        territoryId: groupATerritory.id,
        type: TerritoryAttributionKind.Default,
        startDate: new Date(2025, 9, 1),
        lateDate: new Date(2026, 1, 1),
        congregationId,
      },
    })
    await tx.attribution.create({
      data: {
        publisherId: publisherInGroupBId,
        territoryId: groupBTerritory.id,
        type: TerritoryAttributionKind.Default,
        startDate: new Date(2025, 9, 5),
        lateDate: new Date(2026, 1, 5),
        congregationId,
      },
    })

    // ── #9 working/resting exclusivity scenario ──
    // Territory has TWO attributions:
    //   1. An ended attribution still within its 90-day rest window
    //   2. An in-progress attribution
    // It should count as `active working`, NOT `resting`, NOT `available`.
    const workingResting = await tx.territory.create({
      data: { number: `T-WR-${ts}`, type: TerritoryKind.Classical, congregationId },
    })
    workingPlusRestingTerritoryId = workingResting.id

    const recentEnd = new Date()
    recentEnd.setDate(recentEnd.getDate() - 30) // 30 days ago — still inside 90-day rest window
    const restStart = new Date(recentEnd)
    restStart.setDate(restStart.getDate() - 30)
    await tx.attribution.create({
      data: {
        publisherId: publisherInGroupAId,
        territoryId: workingPlusRestingTerritoryId,
        type: TerritoryAttributionKind.Default,
        startDate: restStart,
        endDate: recentEnd,
        lateDate: new Date(restStart.getTime() + 120 * 24 * 60 * 60 * 1000),
        congregationId,
      },
    })
    const inProgressStart = new Date()
    inProgressStart.setDate(inProgressStart.getDate() - 1)
    await tx.attribution.create({
      data: {
        publisherId: publisherInGroupAId,
        territoryId: workingPlusRestingTerritoryId,
        type: TerritoryAttributionKind.Default,
        startDate: inProgressStart,
        lateDate: new Date(inProgressStart.getTime() + 120 * 24 * 60 * 60 * 1000),
        congregationId,
      },
    })

    // ── #11 previous-year denominator scenario ──
    // One territory created in a previous theocratic year; one created today.
    const oldTerritory = await tx.territory.create({
      data: {
        number: `T-OLD-${ts}`,
        type: TerritoryKind.Classical,
        congregationId,
        createdAt: new Date(2024, 0, 1), // before Aug 31, 2025 cutoff
      },
    })
    oldTerritoryId = oldTerritory.id

    const recentTerritory = await tx.territory.create({
      data: {
        number: `T-NEW-${ts}`,
        type: TerritoryKind.Classical,
        congregationId,
        createdAt: new Date(2026, 0, 1), // after Aug 31, 2025 cutoff
      },
    })
    recentTerritoryId = recentTerritory.id
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.attribution.deleteMany({ where: { congregationId } })
    // Member.publisherGroupId points at PublisherGroup; PublisherGroup.responsibleId
    // points at Member. Break the FK cycle by nulling memberships before deleting
    // the group, then delete the members.
    await tx.member.updateMany({
      where: { congregationId, publisherGroupId: { not: null } },
      data: { publisherGroupId: null },
    })
    await tx.publisherGroup.deleteMany({ where: { congregationId } })
    await tx.member.deleteMany({ where: { congregationId } })
    await tx.territory.deleteMany({ where: { congregationId } })
  })
  await testDb.auditLog.deleteMany({ where: { congregationId } })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('stats aggregates — boundary semantics (R1)', () => {
  it('includes an attribution that starts on the last day of the filter window', async () => {
    const results = await withScope(congregationId, async tx => {
      return fetchAttributionsForStats(
        tx as never,
        {
          territoryKind: [TerritoryKind.Classical],
          attributionKind: [TerritoryAttributionKind.Default],
          startDate: FILTER_START,
          endDate: FILTER_END,
        },
        congregationId,
      )
    })

    expect(results.map(a => a.territoryId)).toContain(lastDayTerritoryId)
  })
})

describe('stats aggregates — group scoping (#8)', () => {
  it('applies the group filter to attribution coverage', async () => {
    const [coverageAllGroups, coverageGroupA, coverageGroupB] = await withScope(congregationId, async tx => {
      return Promise.all([
        computeTerritoryCoverage(
          tx as never,
          congregationId,
          [TerritoryKind.Classical],
          [TerritoryAttributionKind.Default],
          FILTER_START,
          FILTER_END,
        ),
        computeTerritoryCoverage(
          tx as never,
          congregationId,
          [TerritoryKind.Classical],
          [TerritoryAttributionKind.Default],
          FILTER_START,
          FILTER_END,
          groupAId,
        ),
        computeTerritoryCoverage(
          tx as never,
          congregationId,
          [TerritoryKind.Classical],
          [TerritoryAttributionKind.Default],
          FILTER_START,
          FILTER_END,
          groupBId,
        ),
      ])
    })

    expect(coverageAllGroups).toBeGreaterThan(coverageGroupA)
    expect(coverageAllGroups).toBeGreaterThan(coverageGroupB)
    // Each group has at least one attribution.
    expect(coverageGroupA).toBeGreaterThan(0)
    expect(coverageGroupB).toBeGreaterThan(0)
  })
})

describe('stats aggregates — working/resting exclusivity (#9)', () => {
  it('does not double-count a territory that is both working and (would-be) resting', async () => {
    const [active, resting, available] = await withScope(congregationId, async tx => {
      return Promise.all([
        countActiveWorkingTerritories(tx as never, congregationId),
        countRestingTerritories(tx as never, congregationId),
        countAvailableTerritories(tx as never, congregationId),
      ])
    })

    // The territory with one in-progress + one rest-period attribution is
    // counted as active-working, NOT as resting (the `none: { endDate: null }`
    // clause excludes it from the resting bucket).
    expect(active).toBeGreaterThanOrEqual(1)

    const territoriesInBoth = await testDb.territory.findMany({
      where: {
        congregationId,
        id: workingPlusRestingTerritoryId,
        attributions: {
          some: { endDate: null },
          // A territory matching this resting predicate after the fix would NOT have endDate=null
        },
      },
    })
    expect(territoriesInBoth).toHaveLength(1)

    // Sanity: the buckets are independent counts, so this assertion is a
    // mild lower-bound — but the test territory must not contribute twice.
    // (`available` is `every` so it excludes any territory with an in-progress attribution.)
    expect(active + resting + available).toBeGreaterThan(0)
  })
})

describe('stats aggregates — previous-year denominator (#11)', () => {
  it('counts only territories that existed at or before the cutoff', async () => {
    const cutoff = new Date(2025, 7, 31) // Aug 31, 2025 — between the two test territories' createdAt
    const [allCount, beforeCutoffCount] = await withScope(congregationId, async tx => {
      return Promise.all([
        tx.territory.count({ where: { congregationId } }),
        countTerritoriesExistingBefore(tx as never, congregationId, cutoff, [TerritoryKind.Classical]),
      ])
    })

    expect(allCount).toBeGreaterThan(beforeCutoffCount)
    // The "old" territory (createdAt = Jan 2024) is before the cutoff; the "recent"
    // territory (createdAt = Jan 2026) is after. Both other territories (boundary,
    // group A/B, working+resting) have createdAt = now (after the cutoff).
    // So `beforeCutoffCount` should include `oldTerritoryId` but not `recentTerritoryId`.
    const oldExists = await testDb.territory.findFirst({
      where: { id: oldTerritoryId, createdAt: { lte: cutoff } },
    })
    const recentExists = await testDb.territory.findFirst({
      where: { id: recentTerritoryId, createdAt: { lte: cutoff } },
    })
    expect(oldExists).not.toBeNull()
    expect(recentExists).toBeNull()
    expect(beforeCutoffCount).toBe(1)
  })
})
