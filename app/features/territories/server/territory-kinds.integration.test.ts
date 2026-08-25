import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { findAttributablePublishers } from './attributable-publishers.queries'
import * as attributionAggregate from './attribution.aggregate'
import { assertPublisherAllowedForKind } from './attribution-eligibility.policy'
import { createAttribution } from './create-attribution.server'
import { getKindAllowedRoleIds, listTerritoryKindsWithRoles } from './territory-kinds.queries'
import { seedBuiltInTerritoryKinds, setKindAllowedRoles } from './territory-kinds.server'

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
let foreignCongId: number
let elderRoleId: number
let publisherRoleId: number
/** Holds the elder role directly on the member (identity-role path). */
let elderMemberId: number
/** Holds the elder role through their linked account (custom-role path). */
let accountElderMemberId: number
/** Publisher with neither. */
let plainMemberId: number
let actorId: number

beforeAll(async () => {
  const primary = await testDb.congregation.create({
    data: { name: `TerritoryKinds Primary ${ts}`, slug: `tk-primary-${ts}`, active: true },
  })
  primaryCongId = primary.id

  const foreign = await testDb.congregation.create({
    data: { name: `TerritoryKinds Foreign ${ts}`, slug: `tk-foreign-${ts}`, active: true },
  })
  foreignCongId = foreign.id

  await withScope(primaryCongId, async tx => {
    await seedBuiltInTerritoryKinds(tx, primaryCongId)

    const elder = await tx.role.create({ data: { key: 'elder', isBuiltIn: true, congregationId: primaryCongId } })
    elderRoleId = elder.id
    const publisher = await tx.role.create({
      data: { key: 'publisher', isBuiltIn: true, congregationId: primaryCongId },
    })
    publisherRoleId = publisher.id

    const elderMember = await tx.member.create({
      data: { firstname: 'Aline', lastname: 'Ancien', isPublisher: true, congregationId: primaryCongId },
    })
    elderMemberId = elderMember.id
    await tx.memberRoleAssignment.create({
      data: { memberId: elderMember.id, roleId: elder.id, congregationId: primaryCongId },
    })

    const accountElderMember = await tx.member.create({
      data: { firstname: 'Bruno', lastname: 'Compte', isPublisher: true, congregationId: primaryCongId },
    })
    accountElderMemberId = accountElderMember.id
    const account = await tx.userAccount.create({
      data: {
        email: `tk-account-${ts}@test.com`,
        password: 'h',
        active: true,
        memberId: accountElderMember.id,
        congregationId: primaryCongId,
      },
    })
    actorId = account.id
    await tx.userRoleAssignment.create({
      data: { userId: account.id, roleId: elder.id, congregationId: primaryCongId },
    })

    const plainMember = await tx.member.create({
      data: { firstname: 'Chloé', lastname: 'Simple', isPublisher: true, congregationId: primaryCongId },
    })
    plainMemberId = plainMember.id
  })

  await withScope(foreignCongId, async tx => {
    await seedBuiltInTerritoryKinds(tx, foreignCongId)
    const foreignElder = await tx.role.create({
      data: { key: 'elder', isBuiltIn: true, congregationId: foreignCongId },
    })
    const foreignPhone = await tx.territoryKind.findFirstOrThrow({
      where: { key: TerritoryKindKey.Phone, congregationId: foreignCongId },
    })
    await tx.territoryKindAllowedRole.create({
      data: { kindId: foreignPhone.id, roleId: foreignElder.id, congregationId: foreignCongId },
    })
  })
})

afterAll(async () => {
  const scope = { congregationId: { in: [primaryCongId, foreignCongId] } }
  await testDb.territoryKindAllowedRole.deleteMany({ where: scope })
  await testDb.territoryKind.deleteMany({ where: scope })
  await testDb.userRoleAssignment.deleteMany({ where: scope })
  await testDb.memberRoleAssignment.deleteMany({ where: scope })
  await testDb.userAccount.deleteMany({ where: scope })
  await testDb.member.deleteMany({ where: scope })
  await testDb.role.deleteMany({ where: scope })
  // Drain fire-and-forget audit writes before deleting the congregations,
  // otherwise an in-flight write lands after cleanup and breaks the FK.
  await flushPendingAuditWrites()
  await testDb.auditLog.deleteMany({ where: scope })
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, foreignCongId] } } })
  await testDb.$disconnect()
})

describe('seedBuiltInTerritoryKinds', () => {
  it('creates the five built-in kinds and is safe to re-run', async () => {
    await withScope(primaryCongId, tx => seedBuiltInTerritoryKinds(tx, primaryCongId))

    const kinds = await withScope(primaryCongId, tx => listTerritoryKindsWithRoles(tx, primaryCongId))
    expect(kinds.map(k => k.key).sort()).toEqual(['Classical', 'Commerces', 'Hotel', 'Phone', 'Univ'])
    expect(kinds.every(k => k.isBuiltIn)).toBe(true)
  })
})

describe('setKindAllowedRoles', () => {
  it('persists the selection and reads it back', async () => {
    await withScope(primaryCongId, tx =>
      setKindAllowedRoles(tx, TerritoryKindKey.Phone, [elderRoleId], primaryCongId, actorId),
    )

    const roleIds = await withScope(primaryCongId, tx =>
      getKindAllowedRoleIds(tx, TerritoryKindKey.Phone, primaryCongId),
    )
    expect(roleIds).toEqual([elderRoleId])

    await withScope(primaryCongId, tx => setKindAllowedRoles(tx, TerritoryKindKey.Phone, [], primaryCongId, actorId))
  })

  it('replaces rather than accumulates across saves', async () => {
    await withScope(primaryCongId, tx =>
      setKindAllowedRoles(tx, TerritoryKindKey.Commerces, [elderRoleId, publisherRoleId], primaryCongId, actorId),
    )
    await withScope(primaryCongId, tx =>
      setKindAllowedRoles(tx, TerritoryKindKey.Commerces, [publisherRoleId], primaryCongId, actorId),
    )

    const roleIds = await withScope(primaryCongId, tx =>
      getKindAllowedRoleIds(tx, TerritoryKindKey.Commerces, primaryCongId),
    )
    expect(roleIds).toEqual([publisherRoleId])

    await withScope(primaryCongId, tx =>
      setKindAllowedRoles(tx, TerritoryKindKey.Commerces, [], primaryCongId, actorId),
    )
  })

  it('drops the link when the role is deleted, leaving the kind unrestricted', async () => {
    const doomed = await withScope(primaryCongId, tx =>
      tx.role.create({ data: { key: `temp-${ts}`, name: 'Temp', congregationId: primaryCongId } }),
    )
    await withScope(primaryCongId, tx =>
      setKindAllowedRoles(tx, TerritoryKindKey.Hotel, [doomed.id], primaryCongId, actorId),
    )

    await withScope(primaryCongId, tx => tx.role.delete({ where: { id: doomed.id } }))

    const roleIds = await withScope(primaryCongId, tx =>
      getKindAllowedRoleIds(tx, TerritoryKindKey.Hotel, primaryCongId),
    )
    expect(roleIds).toEqual([])
  })
})

describe('tenant isolation', () => {
  it('does not surface another congregation configuration', async () => {
    const roleIds = await withScope(primaryCongId, tx =>
      getKindAllowedRoleIds(tx, TerritoryKindKey.Phone, primaryCongId),
    )
    expect(roleIds).toEqual([])

    const rows = await withScope(primaryCongId, tx => tx.territoryKindAllowedRole.findMany({}))
    expect(rows.every(row => row.congregationId === primaryCongId)).toBe(true)
  })
})

describe('findAttributablePublishers', () => {
  it('lists every active publisher for an unrestricted kind', async () => {
    const result = await withScope(primaryCongId, tx =>
      findAttributablePublishers(tx, TerritoryKindKey.Classical, primaryCongId),
    )

    expect(result.map(p => p.id).sort()).toEqual([elderMemberId, accountElderMemberId, plainMemberId].sort())
  })

  it('reaches the role through both the member and their account', async () => {
    await withScope(primaryCongId, tx =>
      setKindAllowedRoles(tx, TerritoryKindKey.Univ, [elderRoleId], primaryCongId, actorId),
    )

    const result = await withScope(primaryCongId, tx =>
      findAttributablePublishers(tx, TerritoryKindKey.Univ, primaryCongId),
    )

    expect(result.map(p => p.id).sort()).toEqual([elderMemberId, accountElderMemberId].sort())
  })

  it('keeps the already-attributed publisher listed even when they no longer qualify', async () => {
    const result = await withScope(primaryCongId, tx =>
      findAttributablePublishers(tx, TerritoryKindKey.Univ, primaryCongId, { alwaysIncludeMemberId: plainMemberId }),
    )

    expect(result.map(p => p.id)).toContain(plainMemberId)
  })
})

describe('role gating on the attribution paths', () => {
  it('blocks the human path but leaves the aggregate open for the campaign sweep', async () => {
    const territory = await withScope(primaryCongId, tx =>
      tx.territory.create({
        data: { number: `TK-${ts}`, type: TerritoryKindKey.Phone, notes: '', congregationId: primaryCongId },
      }),
    )
    await withScope(primaryCongId, tx =>
      setKindAllowedRoles(tx, TerritoryKindKey.Phone, [elderRoleId], primaryCongId, actorId),
    )

    const params = {
      publisherId: plainMemberId,
      territoryId: territory.id,
      startDate: '2026-01-05',
      notes: '',
      type: TerritoryAttributionKind.Default,
      congregationId: primaryCongId,
      actorId,
    }

    // The routes go through createAttribution, which gates.
    await withScope(primaryCongId, async tx => {
      await expect(createAttribution(tx, params)).rejects.toThrow('publisher_role_not_allowed')
    })

    // campaign-lifecycle.workflow calls the aggregate directly, and must keep
    // carrying an existing pairing across a role change — _reassignIntoCampaign
    // swallows ConflictError, so a gate here would silently drop the territory.
    const carried = await withScope(primaryCongId, tx => attributionAggregate.assign(tx, params))
    expect(carried.publisherId).toBe(plainMemberId)

    await withScope(primaryCongId, async tx => {
      await tx.attribution.deleteMany({ where: { territoryId: territory.id } })
      await tx.territory.delete({ where: { id_congregationId: { id: territory.id, congregationId: primaryCongId } } })
      await setKindAllowedRoles(tx, TerritoryKindKey.Phone, [], primaryCongId, actorId)
    })
  })
})

describe('assertPublisherAllowedForKind', () => {
  it('accepts a qualifying publisher and rejects one who is not', async () => {
    await withScope(primaryCongId, async tx => {
      await expect(
        assertPublisherAllowedForKind(tx, TerritoryKindKey.Univ, elderMemberId, primaryCongId),
      ).resolves.toBeUndefined()
      await expect(
        assertPublisherAllowedForKind(tx, TerritoryKindKey.Univ, plainMemberId, primaryCongId),
      ).rejects.toThrow('publisher_role_not_allowed')
    })
  })

  it('accepts anyone once the restriction is cleared', async () => {
    await withScope(primaryCongId, tx => setKindAllowedRoles(tx, TerritoryKindKey.Univ, [], primaryCongId, actorId))

    await withScope(primaryCongId, async tx => {
      await expect(
        assertPublisherAllowedForKind(tx, TerritoryKindKey.Univ, plainMemberId, primaryCongId),
      ).resolves.toBeUndefined()
    })
  })
})
