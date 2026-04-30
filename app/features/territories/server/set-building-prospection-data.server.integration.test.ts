import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'

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
let primaryCongId: number
let otherCongId: number
let primaryBuildingId: number
let otherBuildingId: number

const { setBuildingProspectionData } = await import('./set-building-prospection-data.server')

function emptyInput(overrides: Partial<Parameters<typeof setBuildingProspectionData>[2]> = {}) {
  return {
    'has-residential': '',
    shopkinds: [],
    'commerce-notes': [],
    hotel: '',
    campus: '',
    landromat: '',
    'prospection-date': '',
    homes: '',
    phones: '',
    liberals: '',
    access: '',
    pmr: '',
    doors: '',
    mailboxes: '',
    'residential-notes': '',
    'shared-entrance-buildings': '',
    ...overrides,
  } satisfies Parameters<typeof setBuildingProspectionData>[2]
}

beforeAll(async () => {
  const primaryCong = await testDb.congregation.create({
    data: { name: `Building Primary ${ts}`, slug: `bldg-primary-${ts}`, active: true },
  })
  primaryCongId = primaryCong.id

  const otherCong = await testDb.congregation.create({
    data: { name: `Building Other ${ts}`, slug: `bldg-other-${ts}`, active: true },
  })
  otherCongId = otherCong.id

  await withScope(primaryCongId, async tx => {
    const b = await tx.building.create({
      data: { number: '10', street: 'Rue Test', zip: '75001', congregationId: primaryCongId },
    })
    primaryBuildingId = b.id
  })

  await withScope(otherCongId, async tx => {
    const b = await tx.building.create({
      data: { number: '10', street: 'Rue Test', zip: '75001', congregationId: otherCongId },
    })
    otherBuildingId = b.id
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.buildingResidentialData.deleteMany({})
      await tx.buildingAccess.deleteMany({})
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('setBuildingProspectionData (integration)', () => {
  it('creates a residential entrance when has-residential is checked', async () => {
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(tx, primaryBuildingId, emptyInput({ 'has-residential': 'on', homes: '3' })),
    )

    const entrances = await withScope(primaryCongId, tx =>
      tx.buildingEntrance.findMany({ where: { kind: EntranceKind.Residential } }),
    )
    expect(entrances.length).toBeGreaterThanOrEqual(1)

    const residentialData = await testDb.buildingResidentialData.findFirst({
      where: { buildingId: primaryBuildingId },
    })
    expect(residentialData?.homes).toBe(3)
  })

  it('removes the residential entrance when has-residential is unchecked', async () => {
    // First ensure one exists
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(tx, primaryBuildingId, emptyInput({ 'has-residential': 'on', homes: '2' })),
    )

    // Now uncheck
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(tx, primaryBuildingId, emptyInput()),
    )

    const residentialData = await testDb.buildingResidentialData.findFirst({
      where: { buildingId: primaryBuildingId },
    })
    expect(residentialData).toBeNull()
  })

  it('creates commerce entrances for each shopkind provided', async () => {
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(
        tx,
        primaryBuildingId,
        emptyInput({ shopkinds: ['bakery', 'pharmacy'], 'commerce-notes': ['fresh bread', ''] }),
      ),
    )

    const commerceEntrances = await withScope(primaryCongId, tx =>
      tx.buildingEntrance.findMany({ where: { kind: EntranceKind.Commerce } }),
    )
    expect(commerceEntrances).toHaveLength(2)
    const kinds = commerceEntrances.map(e => e.shopKind)
    expect(kinds).toContain('bakery')
    expect(kinds).toContain('pharmacy')

    // Cleanup
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(tx, primaryBuildingId, emptyInput()),
    )
  })

  it('creates hotel entrance when hotel flag is set', async () => {
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(tx, primaryBuildingId, emptyInput({ hotel: 'on' })),
    )

    const hotel = await withScope(primaryCongId, tx =>
      tx.buildingEntrance.findFirst({ where: { kind: EntranceKind.Hotel } }),
    )
    expect(hotel).not.toBeNull()

    // Cleanup
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(tx, primaryBuildingId, emptyInput()),
    )
  })

  it('upsert of residential data does not touch another congregation building with same buildingId sequence — RLS isolation', async () => {
    // Create residential data for primary building
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(tx, primaryBuildingId, emptyInput({ 'has-residential': 'on', homes: '5' })),
    )

    // Create residential data for other congregation building
    await withScope(otherCongId, tx =>
      setBuildingProspectionData(tx, otherBuildingId, emptyInput({ 'has-residential': 'on', homes: '8' })),
    )

    // Update primary building
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(tx, primaryBuildingId, emptyInput({ 'has-residential': 'on', homes: '10' })),
    )

    const primaryData = await testDb.buildingResidentialData.findFirst({
      where: { buildingId: primaryBuildingId },
    })
    const otherData = await testDb.buildingResidentialData.findFirst({
      where: { buildingId: otherBuildingId },
    })

    // Primary was updated to 10; other should still be 8
    expect(primaryData?.homes).toBe(10)
    expect(otherData?.homes).toBe(8)
  })

  it('sets prospection date on the building', async () => {
    const date = '2024-06-15'
    await withScope(primaryCongId, tx =>
      setBuildingProspectionData(tx, primaryBuildingId, emptyInput({ 'prospection-date': date })),
    )

    const building = await testDb.building.findUnique({ where: { id: primaryBuildingId } })
    expect(building?.prospectionDate?.toISOString().startsWith('2024-06-15')).toBe(true)
  })
})
