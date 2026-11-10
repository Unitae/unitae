import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { ConflictError, ValidationError } from '~/shared/errors/app-error.server'

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
let targetTerritoryId: number
let sourceTerritoryId: number
let phoneTerritoryId: number
let crossCongTerritoryId: number
let entranceShared: number
let entranceFree: number
let entranceCrossCong: number
let entranceOnPhone: number

const { updateTerritory } = await import('./update-territory.server')
const { EntranceTakenError } = await import('./territory-entrances.server')

beforeAll(async () => {
  const primary = await testDb.congregation.create({
    data: { name: `UT Primary ${ts}`, slug: `ut-primary-${ts}`, active: true },
  })
  primaryCongId = primary.id

  const other = await testDb.congregation.create({
    data: { name: `UT Other ${ts}`, slug: `ut-other-${ts}`, active: true },
  })
  otherCongId = other.id

  await withScope(primaryCongId, async tx => {
    const targetTerritory = await tx.territory.create({
      data: { number: `UT-TGT-${ts}`, type: TerritoryKindKey.Classical, congregationId: primaryCongId },
    })
    targetTerritoryId = targetTerritory.id

    const sourceTerritory = await tx.territory.create({
      data: { number: `UT-SRC-${ts}`, type: TerritoryKindKey.Classical, congregationId: primaryCongId },
    })
    sourceTerritoryId = sourceTerritory.id

    const phoneTerritory = await tx.territory.create({
      data: { number: `UT-PHN-${ts}`, type: TerritoryKindKey.Phone, congregationId: primaryCongId },
    })
    phoneTerritoryId = phoneTerritory.id

    const buildingShared = await tx.building.create({
      data: { number: '1', street: 'Rue X', zip: '75001', congregationId: primaryCongId },
    })
    const shared = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingShared.id } },
        territories: { connect: { id: sourceTerritoryId } },
      },
    })
    entranceShared = shared.id

    const buildingFree = await tx.building.create({
      data: { number: '2', street: 'Rue X', zip: '75001', congregationId: primaryCongId },
    })
    const free = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingFree.id } },
      },
    })
    entranceFree = free.id

    const buildingPhone = await tx.building.create({
      data: { number: '3', street: 'Rue X', zip: '75001', congregationId: primaryCongId },
    })
    const onPhone = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingPhone.id } },
        territories: { connect: { id: phoneTerritoryId } },
      },
    })
    entranceOnPhone = onPhone.id
  })

  await withScope(otherCongId, async tx => {
    const crossCong = await tx.territory.create({
      data: { number: `UT-XC-${ts}`, type: TerritoryKindKey.Classical, congregationId: otherCongId },
    })
    crossCongTerritoryId = crossCong.id

    const buildingCross = await tx.building.create({
      data: { number: '99', street: 'Rue X', zip: '75001', congregationId: otherCongId },
    })
    const cross = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        congregationId: otherCongId,
        buildings: { connect: { id: buildingCross.id } },
        territories: { connect: { id: crossCongTerritoryId } },
      },
    })
    entranceCrossCong = cross.id
  })
})

afterAll(async () => {
  for (const cid of [primaryCongId, otherCongId]) {
    if (!cid) continue
    await withScope(cid, async tx => {
      await tx.attribution.deleteMany({})
      await tx.buildingResidentialData.deleteMany({})
      await tx.buildingAccess.deleteMany({})
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
      await tx.territory.deleteMany({})
    })
  }
  await testDb.auditLog.deleteMany({ where: { congregationId: { in: [primaryCongId, otherCongId] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

beforeEach(async () => {
  await withScope(primaryCongId, async tx => {
    await tx.buildingEntrance.update({
      where: { id: entranceShared },
      data: { territories: { set: [{ id: sourceTerritoryId }] } },
    })
    await tx.territory.update({
      where: { id_congregationId: { id: targetTerritoryId, congregationId: primaryCongId } },
      data: { number: `UT-TGT-${ts}`, entrances: { set: [] } },
    })
  })
})

describe('updateTerritory (integration)', () => {
  it('applies entrance set without reassignments (backwards compatible)', async () => {
    await withScope(primaryCongId, tx =>
      updateTerritory(tx, targetTerritoryId, primaryCongId, 1, {
        entranceIds: [entranceFree],
        notes: 'updated',
      }),
    )

    const territory = await testDb.territory.findUnique({
      where: { id: targetTerritoryId },
      include: { entrances: { select: { id: true } } },
    })
    expect(territory?.notes).toBe('updated')
    expect(territory?.entrances.map(e => e.id)).toEqual([entranceFree])
  })

  it('moves a shared entrance from source to target territory and audits the reassignment', async () => {
    await withScope(primaryCongId, tx =>
      updateTerritory(tx, targetTerritoryId, primaryCongId, 1, {
        entranceIds: [entranceShared],
        reassignments: [{ entranceId: entranceShared, fromTerritoryId: sourceTerritoryId }],
        notes: '',
      }),
    )

    const target = await testDb.territory.findUnique({
      where: { id: targetTerritoryId },
      include: { entrances: { select: { id: true } } },
    })
    const source = await testDb.territory.findUnique({
      where: { id: sourceTerritoryId },
      include: { entrances: { select: { id: true } } },
    })
    expect(target?.entrances.map(e => e.id)).toEqual([entranceShared])
    expect(source?.entrances).toEqual([])

    // audit() is fire-and-forget — wait for the write to settle before polling.
    await flushPendingAuditWrites()
    const auditLog = await testDb.auditLog.findFirst({
      where: {
        action: 'entrance.reassigned',
        entityType: 'BuildingEntrance',
        entityId: entranceShared,
      },
      orderBy: { createdAt: 'desc' },
    })
    expect(auditLog).not.toBeNull()
    expect(auditLog?.metadata).toContain(`"fromTerritoryId":${sourceTerritoryId}`)
    expect(auditLog?.metadata).toContain(`"toTerritoryId":${targetTerritoryId}`)
  })

  it('refuses reassignment when source territory has a different type', async () => {
    await expect(
      withScope(primaryCongId, tx =>
        updateTerritory(tx, targetTerritoryId, primaryCongId, 1, {
          entranceIds: [entranceShared],
          reassignments: [{ entranceId: entranceShared, fromTerritoryId: phoneTerritoryId }],
          notes: '',
        }),
      ),
    ).rejects.toThrow(ValidationError)
  })

  it('refuses reassignment when entrance is not actually linked to the source', async () => {
    await expect(
      withScope(primaryCongId, tx =>
        updateTerritory(tx, targetTerritoryId, primaryCongId, 1, {
          entranceIds: [entranceFree],
          reassignments: [{ entranceId: entranceFree, fromTerritoryId: sourceTerritoryId }],
          notes: '',
        }),
      ),
    ).rejects.toThrow(ValidationError)
  })

  it('refuses reassignment from a territory belonging to another congregation', async () => {
    await expect(
      withScope(primaryCongId, tx =>
        updateTerritory(tx, targetTerritoryId, primaryCongId, 1, {
          entranceIds: [entranceCrossCong],
          reassignments: [{ entranceId: entranceCrossCong, fromTerritoryId: crossCongTerritoryId }],
          notes: '',
        }),
      ),
    ).rejects.toThrow(ValidationError)
  })

  it('rolls back the territory update if a reassignment validation fails', async () => {
    await expect(
      withScope(primaryCongId, tx =>
        updateTerritory(tx, targetTerritoryId, primaryCongId, 1, {
          entranceIds: [entranceFree, entranceShared],
          reassignments: [
            { entranceId: entranceShared, fromTerritoryId: sourceTerritoryId },
            { entranceId: entranceFree, fromTerritoryId: sourceTerritoryId },
          ],
          notes: 'should-not-persist',
        }),
      ),
    ).rejects.toThrow(ValidationError)

    const target = await testDb.territory.findUnique({
      where: { id: targetTerritoryId },
      select: { notes: true, entrances: { select: { id: true } } },
    })
    expect(target?.notes).not.toBe('should-not-persist')
    expect(target?.entrances).toEqual([])
    const sourceShared = await testDb.buildingEntrance.findUnique({
      where: { id: entranceShared },
      include: { territories: { select: { id: true } } },
    })
    expect(sourceShared?.territories.map(t => t.id)).toContain(sourceTerritoryId)
  })

  it('refuses an entrance that is on another territory of the same type, and says which', async () => {
    const attempt = withScope(primaryCongId, tx =>
      updateTerritory(tx, targetTerritoryId, primaryCongId, 1, { entranceIds: [entranceShared], notes: '' }),
    )

    await expect(attempt).rejects.toBeInstanceOf(EntranceTakenError)
    await expect(attempt).rejects.toMatchObject({
      entrances: [{ id: entranceShared, address: '1 Rue X', territoryNumber: `UT-SRC-${ts}` }],
    })
  })

  it('accepts an entrance that sits on a territory of another type', async () => {
    await withScope(primaryCongId, tx =>
      updateTerritory(tx, targetTerritoryId, primaryCongId, 1, { entranceIds: [entranceOnPhone], notes: '' }),
    )

    const target = await testDb.territory.findUnique({
      where: { id: targetTerritoryId },
      include: { entrances: { select: { id: true } } },
    })
    expect(target?.entrances.map(e => e.id)).toEqual([entranceOnPhone])
  })

  it('keeps an entrance the territory already holds, even if another territory of its type holds it too', async () => {
    // Data from before the check: the same entrance on two door-to-door territories.
    await withScope(primaryCongId, tx =>
      tx.territory.update({
        where: { id_congregationId: { id: targetTerritoryId, congregationId: primaryCongId } },
        data: { entrances: { set: [{ id: entranceShared }] } },
      }),
    )

    await withScope(primaryCongId, tx =>
      updateTerritory(tx, targetTerritoryId, primaryCongId, 1, { entranceIds: [entranceShared], notes: 'kept' }),
    )

    const target = await testDb.territory.findUnique({ where: { id: targetTerritoryId }, select: { notes: true } })
    expect(target?.notes).toBe('kept')
  })

  it('renames the territory, the number trimmed', async () => {
    await withScope(primaryCongId, tx =>
      updateTerritory(tx, targetTerritoryId, primaryCongId, 1, {
        number: `  UT-REN-${ts} `,
        entranceIds: [],
        notes: '',
      }),
    )

    const target = await testDb.territory.findUnique({ where: { id: targetTerritoryId }, select: { number: true } })
    expect(target?.number).toBe(`UT-REN-${ts}`)
  })

  it('refuses a number another territory uses, whatever its case', async () => {
    await expect(
      withScope(primaryCongId, tx =>
        updateTerritory(tx, targetTerritoryId, primaryCongId, 1, {
          number: `ut-src-${ts}`,
          entranceIds: [],
          notes: '',
        }),
      ),
    ).rejects.toThrow(new ConflictError('territory_number_taken'))
  })

  it('saves when the number does not change, even if another territory shares it', async () => {
    const twin = await withScope(primaryCongId, tx =>
      tx.territory.create({
        data: { number: `UT-TGT-${ts}`, type: TerritoryKindKey.Classical, congregationId: primaryCongId },
      }),
    )

    await withScope(primaryCongId, tx =>
      updateTerritory(tx, targetTerritoryId, primaryCongId, 1, {
        number: `UT-TGT-${ts}`,
        entranceIds: [],
        notes: 'twin',
      }),
    )

    const target = await testDb.territory.findUnique({ where: { id: targetTerritoryId }, select: { notes: true } })
    expect(target?.notes).toBe('twin')
    await withScope(primaryCongId, tx =>
      tx.territory.delete({ where: { id_congregationId: { id: twin.id, congregationId: primaryCongId } } }),
    )
  })
})
