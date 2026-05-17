import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { resolveEligibleUserIds } from '~/features/events/server/allowed-roles.server'
import {
  applyTemplateToEvent,
  updatePartAssignment,
  updateServiceRoleAssignment,
} from '~/features/events/server/programme-events.server'
import { createSingleEventFromTemplate } from '~/features/events/server/programme-generation.server'
import { upsertTemplatePart, upsertTemplateServiceRole } from '~/features/events/server/programme-templates.server'

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
let foreignElderRoleId: number
let elderUserId: number
let elderAccountId: number
let plainPublisherUserId: number
let nonPublisherUserId: number
let templateId: number
let speakerPartId: number
let serviceRoleId: number
let foreignTemplatePartId: number
let customRoleId: number

beforeAll(async () => {
  const primary = await testDb.congregation.create({
    data: { name: `AllowedRoles Primary ${ts}`, slug: `ar-primary-${ts}`, active: true },
  })
  primaryCongId = primary.id

  const foreign = await testDb.congregation.create({
    data: { name: `AllowedRoles Foreign ${ts}`, slug: `ar-foreign-${ts}`, active: true },
  })
  foreignCongId = foreign.id

  await withScope(primaryCongId, async tx => {
    // Built-in roles (mirrors the seed order in built-in-roles.server.ts)
    const member = await tx.role.create({
      data: { key: 'member', isBuiltIn: true, congregationId: primaryCongId },
    })
    const memberRoleId = member.id

    const elder = await tx.role.create({
      data: { key: 'elder', isBuiltIn: true, congregationId: primaryCongId },
    })
    elderRoleId = elder.id

    const publisher = await tx.role.create({
      data: { key: 'publisher', isBuiltIn: true, congregationId: primaryCongId },
    })
    publisherRoleId = publisher.id

    // Members + accounts. The elder needs an account so tests that create
    // Events (`Event.createdById` -> UserAccount) can use it as the actor.
    const elderMember = await tx.member.create({
      data: {
        firstname: 'Elder',
        lastname: 'Person',
        isPublisher: true,
        congregationId: primaryCongId,
      },
    })
    elderUserId = elderMember.id
    const elderAccount = await tx.userAccount.create({
      data: {
        email: `elder-${ts}@test.com`,
        password: 'h',
        active: true,
        memberId: elderMember.id,
        congregationId: primaryCongId,
      },
    })
    elderAccountId = elderAccount.id

    const plainMember = await tx.member.create({
      data: {
        firstname: 'Plain',
        lastname: 'Publisher',
        isPublisher: true,
        congregationId: primaryCongId,
      },
    })
    plainPublisherUserId = plainMember.id

    const nonPubMember = await tx.member.create({
      data: {
        firstname: 'Non',
        lastname: 'Publisher',
        isPublisher: false,
        congregationId: primaryCongId,
      },
    })
    nonPublisherUserId = nonPubMember.id

    // Identity-role assignments live on Member. Empty allowed list resolves
    // via the `member` built-in role (every current Member). Targeted lists
    // resolve via specific identity roles like `elder` or `publisher`.
    await tx.memberRoleAssignment.createMany({
      data: [
        { memberId: elderUserId, roleId: memberRoleId, congregationId: primaryCongId },
        { memberId: elderUserId, roleId: elderRoleId, congregationId: primaryCongId },
        { memberId: elderUserId, roleId: publisherRoleId, congregationId: primaryCongId },
        { memberId: plainPublisherUserId, roleId: memberRoleId, congregationId: primaryCongId },
        { memberId: plainPublisherUserId, roleId: publisherRoleId, congregationId: primaryCongId },
        // Non-publisher (school student) is also a member — should be eligible by default
        { memberId: nonPublisherUserId, roleId: memberRoleId, congregationId: primaryCongId },
      ],
    })

    // Custom role assigned to the elder's UserAccount only (no MemberRoleAssignment).
    // Used by the regression test that verifies eligibility resolves through
    // both assignment tables, mirroring the three-source rule in #183.
    const custom = await tx.role.create({
      data: { key: `custom-${ts}`, name: 'Custom', isBuiltIn: false, congregationId: primaryCongId },
    })
    customRoleId = custom.id
    await tx.userRoleAssignment.create({
      data: { userId: elderAccountId, roleId: customRoleId, congregationId: primaryCongId },
    })

    // Template + parts + service role
    const template = await tx.programmeTemplate.create({
      data: {
        name: 'Test Template',
        key: `t-${ts}`,
        weekDay: 2,
        isRecurring: true,
        congregationId: primaryCongId,
      },
    })
    templateId = template.id

    const speakerPart = await tx.programmeTemplatePart.create({
      data: {
        name: 'Discours',
        section: '',
        track: '',
        order: 1,
        durationMin: 30,
        templateId,
        congregationId: primaryCongId,
      },
    })
    speakerPartId = speakerPart.id

    const service = await tx.programmeTemplateServiceRole.create({
      data: { name: 'Son', key: `son-${ts}`, templateId, congregationId: primaryCongId },
    })
    serviceRoleId = service.id
  })

  await withScope(foreignCongId, async tx => {
    const foreignElder = await tx.role.create({
      data: { key: 'elder', isBuiltIn: true, congregationId: foreignCongId },
    })
    foreignElderRoleId = foreignElder.id

    const foreignTemplate = await tx.programmeTemplate.create({
      data: { name: 'Foreign T', key: `ft-${ts}`, congregationId: foreignCongId },
    })
    const foreignPart = await tx.programmeTemplatePart.create({
      data: {
        name: 'Foreign Part',
        section: '',
        track: '',
        order: 1,
        durationMin: 10,
        templateId: foreignTemplate.id,
        congregationId: foreignCongId,
      },
    })
    foreignTemplatePartId = foreignPart.id

    await tx.programmeTemplatePartAllowedRole.create({
      data: {
        partId: foreignTemplatePartId,
        roleId: foreignElderRoleId,
        asKind: 'speaker',
        congregationId: foreignCongId,
      },
    })
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, foreignCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.programmePartAssignmentAllowedRole.deleteMany({})
      await tx.programmeServiceRoleAssignmentAllowedRole.deleteMany({})
      await tx.programmeTemplatePartAllowedRole.deleteMany({})
      await tx.programmeTemplateServiceRoleAllowedRole.deleteMany({})
      await tx.programmePartAssignment.deleteMany({})
      await tx.programmeServiceRoleAssignment.deleteMany({})
      await tx.programmeTemplatePart.deleteMany({})
      await tx.programmeTemplateServiceRole.deleteMany({})
      await tx.programmeTemplate.deleteMany({})
      await tx.event.deleteMany({})
      await tx.memberRoleAssignment.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.role.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
    })
    await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, foreignCongId] } } })
  await testDb.$disconnect()
})

describe('resolveEligibleUserIds (integration)', () => {
  it('returns every Member (via built-in `member` role) when allowed list is empty', async () => {
    const result = await withScope(primaryCongId, tx => resolveEligibleUserIds(tx, [], primaryCongId))
    // School-student (non-publisher) Members are now also eligible — the
    // member fallback is broader than the old publisher gate.
    expect(result.sort()).toEqual([elderUserId, plainPublisherUserId, nonPublisherUserId].sort())
  })

  it('returns only role-matching members when list is non-empty', async () => {
    const result = await withScope(primaryCongId, tx => resolveEligibleUserIds(tx, [elderRoleId], primaryCongId))
    expect(result).toEqual([elderUserId])
    expect(result).not.toContain(plainPublisherUserId)
  })

  it('does not leak users from another congregation', async () => {
    const result = await withScope(foreignCongId, tx => resolveEligibleUserIds(tx, [foreignElderRoleId], foreignCongId))
    expect(result).toEqual([])
  })

  it('includes members reached only via UserRoleAssignment on the linked account', async () => {
    const result = await withScope(primaryCongId, tx => resolveEligibleUserIds(tx, [customRoleId], primaryCongId))
    expect(result).toEqual([elderUserId])
  })
})

describe('upsertTemplatePart + RLS (integration)', () => {
  it('persists allowed-role rows scoped to the congregation', async () => {
    await withScope(primaryCongId, tx =>
      upsertTemplatePart(
        tx,
        templateId,
        {
          id: speakerPartId,
          name: 'Discours',
          section: '',
          track: '',
          order: 1,
          durationMin: 30,
          allowExternalSpeaker: false,
          allowedSpeakerRoleIds: [elderRoleId],
          allowedReaderRoleIds: [publisherRoleId],
        },
        primaryCongId,
        elderAccountId,
      ),
    )

    const rows = await withScope(primaryCongId, tx =>
      tx.programmeTemplatePartAllowedRole.findMany({
        where: { partId: speakerPartId },
        orderBy: [{ asKind: 'asc' }, { roleId: 'asc' }],
      }),
    )
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.asKind).sort()).toEqual(['reader', 'speaker'])
  })

  it('does not see allowed-role rows from another congregation', async () => {
    const rows = await withScope(primaryCongId, tx =>
      tx.programmeTemplatePartAllowedRole.findMany({ where: { partId: foreignTemplatePartId } }),
    )
    expect(rows).toEqual([])
  })
})

describe('upsertTemplateServiceRole + RLS (integration)', () => {
  it('persists allowed-role rows for service role', async () => {
    await withScope(primaryCongId, tx =>
      upsertTemplateServiceRole(
        tx,
        templateId,
        { id: serviceRoleId, name: 'Son', key: `son-${ts}`, allowedRoleIds: [elderRoleId] },
        primaryCongId,
        elderAccountId,
      ),
    )

    const rows = await withScope(primaryCongId, tx =>
      tx.programmeTemplateServiceRoleAllowedRole.findMany({ where: { serviceRoleId } }),
    )
    expect(rows).toEqual([{ serviceRoleId, roleId: elderRoleId, congregationId: primaryCongId }])
  })
})

describe('createSingleEventFromTemplate copies allowed roles (integration)', () => {
  it('copies template-part and service-role allowed-role lists onto the new event assignments', async () => {
    // Pre-condition: speakerPart has [elderRoleId speaker, publisherRoleId reader] from previous test
    // serviceRole has [elderRoleId] from previous test
    const event = await withScope(primaryCongId, tx =>
      createSingleEventFromTemplate(tx, templateId, new Date('2099-01-15'), elderAccountId, primaryCongId, 'UTC'),
    )
    expect(event).not.toBeNull()
    if (!event) return

    const partAllowed = await withScope(primaryCongId, tx =>
      tx.programmePartAssignmentAllowedRole.findMany({
        where: { assignment: { eventId: event.id } },
        orderBy: { asKind: 'asc' },
      }),
    )
    expect(partAllowed.map(r => ({ asKind: r.asKind, roleId: r.roleId }))).toEqual([
      { asKind: 'reader', roleId: publisherRoleId },
      { asKind: 'speaker', roleId: elderRoleId },
    ])

    const serviceAllowed = await withScope(primaryCongId, tx =>
      tx.programmeServiceRoleAssignmentAllowedRole.findMany({
        where: { assignment: { eventId: event.id } },
      }),
    )
    expect(serviceAllowed.map(r => r.roleId)).toEqual([elderRoleId])
  })
})

describe('applyTemplateToEvent copies allowed roles (integration)', () => {
  it('copies template allowed-role lists onto a freeform event', async () => {
    const freeform = await withScope(primaryCongId, async tx => {
      const ev = await tx.event.create({
        data: {
          name: 'Freeform',
          startDate: new Date('2099-02-15T18:00:00Z'),
          endDate: new Date('2099-02-15T20:00:00Z'),
          createdById: elderAccountId,
          congregationId: primaryCongId,
        },
      })
      await applyTemplateToEvent(tx, ev.id, templateId, primaryCongId, elderAccountId)
      return ev
    })

    const partAllowed = await withScope(primaryCongId, tx =>
      tx.programmePartAssignmentAllowedRole.findMany({
        where: { assignment: { eventId: freeform.id } },
        orderBy: { asKind: 'asc' },
      }),
    )
    expect(partAllowed.map(r => r.asKind).sort()).toEqual(['reader', 'speaker'])
  })
})

describe('updatePartAssignment + updateServiceRoleAssignment update allowed roles (integration)', () => {
  it('replaces existing allowed-role rows on update', async () => {
    const event = await withScope(primaryCongId, tx =>
      createSingleEventFromTemplate(tx, templateId, new Date('2099-03-15'), elderAccountId, primaryCongId, 'UTC'),
    )
    if (!event) throw new Error('event not created')

    const partAssignment = await withScope(primaryCongId, tx =>
      tx.programmePartAssignment.findFirst({ where: { eventId: event.id } }),
    )
    if (!partAssignment) throw new Error('part assignment missing')

    await withScope(primaryCongId, tx =>
      updatePartAssignment(
        tx,
        partAssignment.id,
        {
          name: 'Discours',
          section: '',
          track: '',
          order: 1,
          durationMin: 30,
          allowExternalSpeaker: false,
          allowedSpeakerRoleIds: [publisherRoleId], // was [elderRoleId]
          allowedReaderRoleIds: [], // was [publisherRoleId]
        },
        primaryCongId,
        elderAccountId,
      ),
    )

    const after = await withScope(primaryCongId, tx =>
      tx.programmePartAssignmentAllowedRole.findMany({
        where: { assignmentId: partAssignment.id },
        orderBy: { asKind: 'asc' },
      }),
    )
    expect(after).toEqual([
      { assignmentId: partAssignment.id, roleId: publisherRoleId, asKind: 'speaker', congregationId: primaryCongId },
    ])
  })

  it('replaces service-role allowed-role rows on update', async () => {
    const event = await withScope(primaryCongId, tx =>
      createSingleEventFromTemplate(tx, templateId, new Date('2099-04-15'), elderAccountId, primaryCongId, 'UTC'),
    )
    if (!event) throw new Error('event not created')

    const serviceAssignment = await withScope(primaryCongId, tx =>
      tx.programmeServiceRoleAssignment.findFirst({ where: { eventId: event.id } }),
    )
    if (!serviceAssignment) throw new Error('service assignment missing')

    await withScope(primaryCongId, tx =>
      updateServiceRoleAssignment(
        tx,
        serviceAssignment.id,
        { name: 'Son', allowedRoleIds: [] }, // clear allowed roles
        primaryCongId,
        elderAccountId,
      ),
    )

    const after = await withScope(primaryCongId, tx =>
      tx.programmeServiceRoleAssignmentAllowedRole.findMany({ where: { assignmentId: serviceAssignment.id } }),
    )
    expect(after).toEqual([])
  })
})
