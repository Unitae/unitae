import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import {
  getSectionVisibilityRoleIds,
  setSectionVisibilityRoles,
} from '~/features/display-board/server/section-visibility.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'

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
let primaryElderRoleId: number
let primaryPublisherRoleId: number
let foreignElderRoleId: number
let elderUserId: number
let publisherUserId: number
let primarySectionId: number
let foreignSectionId: number

beforeAll(async () => {
  const primary = await testDb.congregation.create({
    data: { name: `SectionVisibility Primary ${ts}`, slug: `sv-primary-${ts}`, active: true },
  })
  primaryCongId = primary.id

  const foreign = await testDb.congregation.create({
    data: { name: `SectionVisibility Foreign ${ts}`, slug: `sv-foreign-${ts}`, active: true },
  })
  foreignCongId = foreign.id

  await withScope(primaryCongId, async tx => {
    const elder = await tx.role.create({
      data: { key: 'elder', isBuiltIn: true, congregationId: primaryCongId },
    })
    primaryElderRoleId = elder.id

    const publisher = await tx.role.create({
      data: { key: 'publisher', isBuiltIn: true, congregationId: primaryCongId },
    })
    primaryPublisherRoleId = publisher.id

    const elderMember = await tx.member.create({
      data: {
        firstname: 'Elder',
        lastname: 'Person',
        isPublisher: true,
        congregationId: primaryCongId,
      },
    })
    const elderUser = await tx.userAccount.create({
      data: {
        email: `sv-elder-${ts}@test.com`,
        password: 'h',
        active: true,
        memberId: elderMember.id,
        congregationId: primaryCongId,
      },
    })
    elderUserId = elderUser.id
    await tx.userRoleAssignment.create({
      data: { userId: elderUser.id, roleId: elder.id, congregationId: primaryCongId },
    })
    await tx.userRoleAssignment.create({
      data: { userId: elderUser.id, roleId: publisher.id, congregationId: primaryCongId },
    })

    const publisherMember = await tx.member.create({
      data: {
        firstname: 'Publisher',
        lastname: 'Person',
        isPublisher: true,
        congregationId: primaryCongId,
      },
    })
    const publisherUser = await tx.userAccount.create({
      data: {
        email: `sv-pub-${ts}@test.com`,
        password: 'h',
        active: true,
        memberId: publisherMember.id,
        congregationId: primaryCongId,
      },
    })
    publisherUserId = publisherUser.id
    await tx.userRoleAssignment.create({
      data: { userId: publisherUser.id, roleId: publisher.id, congregationId: primaryCongId },
    })

    const section = await tx.boardSection.create({
      data: { name: `Letters to Elders ${ts}`, congregationId: primaryCongId },
    })
    primarySectionId = section.id
  })

  await withScope(foreignCongId, async tx => {
    const foreignElder = await tx.role.create({
      data: { key: 'elder', isBuiltIn: true, congregationId: foreignCongId },
    })
    foreignElderRoleId = foreignElder.id

    const section = await tx.boardSection.create({
      data: { name: `Foreign Letters ${ts}`, congregationId: foreignCongId },
    })
    foreignSectionId = section.id

    await tx.boardSectionVisibilityRole.create({
      data: { sectionId: section.id, roleId: foreignElder.id, congregationId: foreignCongId },
    })
  })
})

afterAll(async () => {
  await testDb.boardSectionVisibilityRole.deleteMany({
    where: { congregationId: { in: [primaryCongId, foreignCongId] } },
  })
  await testDb.boardSection.deleteMany({ where: { congregationId: { in: [primaryCongId, foreignCongId] } } })
  await testDb.userRoleAssignment.deleteMany({ where: { congregationId: { in: [primaryCongId, foreignCongId] } } })
  await testDb.userAccount.deleteMany({ where: { congregationId: { in: [primaryCongId, foreignCongId] } } })
  await testDb.member.deleteMany({ where: { congregationId: { in: [primaryCongId, foreignCongId] } } })
  await testDb.role.deleteMany({ where: { congregationId: { in: [primaryCongId, foreignCongId] } } })
  // Drain fire-and-forget audit writes so the deleteMany below clears them all,
  // otherwise an in-flight write can land after cleanup and break the congregation FK.
  await flushPendingAuditWrites()
  await testDb.auditLog.deleteMany({ where: { congregationId: { in: [primaryCongId, foreignCongId] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, foreignCongId] } } })
  await testDb.$disconnect()
})

describe('setSectionVisibilityRoles (integration)', () => {
  it('persists role assignments and is idempotent', async () => {
    await withScope(primaryCongId, async tx => {
      const first = await setSectionVisibilityRoles(
        tx,
        primarySectionId,
        [primaryElderRoleId],
        primaryCongId,
        elderUserId,
      )
      expect(first.added).toEqual([primaryElderRoleId])

      const stored = await getSectionVisibilityRoleIds(tx, primarySectionId, primaryCongId)
      expect(stored).toEqual([primaryElderRoleId])

      const repeat = await setSectionVisibilityRoles(
        tx,
        primarySectionId,
        [primaryElderRoleId],
        primaryCongId,
        elderUserId,
      )
      expect(repeat).toEqual({ added: [], removed: [] })
    })
  })

  it('replaces the role list with diff semantics', async () => {
    await withScope(primaryCongId, async tx => {
      const result = await setSectionVisibilityRoles(
        tx,
        primarySectionId,
        [primaryPublisherRoleId],
        primaryCongId,
        elderUserId,
      )
      expect(result.added).toEqual([primaryPublisherRoleId])
      expect(result.removed).toEqual([primaryElderRoleId])

      const stored = await getSectionVisibilityRoleIds(tx, primarySectionId, primaryCongId)
      expect(stored).toEqual([primaryPublisherRoleId])
    })
  })
})

describe('Row-Level Security on BoardSectionVisibilityRole', () => {
  it('isolates rows across congregations', async () => {
    const fromPrimary = await withScope(primaryCongId, tx =>
      tx.boardSectionVisibilityRole.findMany({ select: { sectionId: true } }),
    )
    expect(fromPrimary.every(r => r.sectionId === primarySectionId)).toBe(true)

    const fromForeign = await withScope(foreignCongId, tx =>
      tx.boardSectionVisibilityRole.findMany({ select: { sectionId: true, roleId: true } }),
    )
    expect(fromForeign).toEqual([{ sectionId: foreignSectionId, roleId: foreignElderRoleId }])
  })
})

describe('resolveEffectiveRoleIds (integration)', () => {
  it('returns the user effective role IDs in the current congregation', async () => {
    const elderRoles = await withScope(primaryCongId, tx => resolveEffectiveRoleIds(tx, elderUserId, primaryCongId))
    expect(elderRoles.sort()).toEqual([primaryElderRoleId, primaryPublisherRoleId].sort())

    const publisherRoles = await withScope(primaryCongId, tx =>
      resolveEffectiveRoleIds(tx, publisherUserId, primaryCongId),
    )
    expect(publisherRoles).toEqual([primaryPublisherRoleId])
  })
})

describe('Cascade delete on BoardSection', () => {
  it('removes orphan visibility rows when the section is deleted', async () => {
    let tempSectionId = 0
    await withScope(primaryCongId, async tx => {
      const section = await tx.boardSection.create({
        data: { name: `Temp Cascade ${ts}`, congregationId: primaryCongId },
      })
      tempSectionId = section.id
      await tx.boardSectionVisibilityRole.create({
        data: { sectionId: section.id, roleId: primaryElderRoleId, congregationId: primaryCongId },
      })
    })

    await withScope(primaryCongId, tx => tx.boardSection.delete({ where: { id: tempSectionId } }))

    const orphans = await withScope(primaryCongId, tx =>
      tx.boardSectionVisibilityRole.findMany({ where: { sectionId: tempSectionId } }),
    )
    expect(orphans).toEqual([])
  })
})
