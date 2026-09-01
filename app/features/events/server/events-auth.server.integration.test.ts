import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { Permission } from '~/shared/types/permission'

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
let managerId: number
let responsibleId: number
let plainId: number
let serviceResponsibleId: number
let otherCongResponsibleId: number
let templateOwnedId: number
let templateOtherId: number
let templateOtherCongId: number
let responsibleRoleId: number
let serviceRoleId: number
let unrelatedRoleId: number
let ownedEventId: number
let foreignEventId: number
let ownedServicePartId: number
let foreignServicePartId: number

const allowAll = (_p: Permission) => true
const allowNone = (_p: Permission) => false
const allowOnly = (allowed: Permission) => (p: Permission) => p === allowed

const { assignmentBelongsToEvent, canEditEvent, getResponsibleTemplateIds, canManageAnyProgram } = await import(
  './events-auth.server'
)

beforeAll(async () => {
  const primary = await testDb.congregation.create({
    data: { name: `Auth Primary ${ts}`, slug: `auth-primary-${ts}`, active: true },
  })
  primaryCongId = primary.id

  const other = await testDb.congregation.create({
    data: { name: `Auth Other ${ts}`, slug: `auth-other-${ts}`, active: true },
  })
  otherCongId = other.id

  await withScope(primaryCongId, async tx => {
    const manager = await tx.userAccount.create({
      data: {
        email: `auth-manager-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Manny',
        lastname: 'Manager',
        active: true,
        congregationId: primaryCongId,
      },
    })
    managerId = manager.id

    const responsible = await tx.userAccount.create({
      data: {
        email: `auth-responsible-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Rose',
        lastname: 'Responsible',
        active: true,
        congregationId: primaryCongId,
      },
    })
    responsibleId = responsible.id

    const plain = await tx.userAccount.create({
      data: {
        email: `auth-plain-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Pat',
        lastname: 'Plain',
        active: true,
        congregationId: primaryCongId,
      },
    })
    plainId = plain.id

    // Sam runs the sono/estrade rota on the same template Rose runs the programme of.
    const serviceResponsible = await tx.userAccount.create({
      data: {
        email: `auth-service-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Sam',
        lastname: 'Service',
        active: true,
        congregationId: primaryCongId,
      },
    })
    serviceResponsibleId = serviceResponsible.id

    const owned = await tx.eventTemplate.create({
      data: { name: 'Owned Template', key: `owned-${ts}`, congregationId: primaryCongId },
    })
    templateOwnedId = owned.id

    const otherTpl = await tx.eventTemplate.create({
      data: { name: 'Other Template', key: `other-${ts}`, congregationId: primaryCongId },
    })
    templateOtherId = otherTpl.id

    // The delegation now runs through a role: the template points at «Responsable», and Rose
    // is seated in it. Pat holds a role too — just not that one — so "refused" cannot pass
    // for the trivial reason of holding no roles at all.
    const responsibleRole = await tx.role.create({
      data: { key: `responsable-owned-${ts}`, name: 'Responsable du modele', congregationId: primaryCongId },
    })
    responsibleRoleId = responsibleRole.id

    const unrelatedRole = await tx.role.create({
      data: { key: `unrelated-${ts}`, name: 'Groupe sans rapport', congregationId: primaryCongId },
    })
    unrelatedRoleId = unrelatedRole.id

    await tx.userRoleAssignment.create({
      data: { userId: responsibleId, roleId: responsibleRoleId, kind: 'leader', congregationId: primaryCongId },
    })
    await tx.userRoleAssignment.create({
      data: { userId: plainId, roleId: unrelatedRoleId, kind: 'member', congregationId: primaryCongId },
    })

    const serviceRole = await tx.role.create({
      data: { key: `responsable-service-${ts}`, name: 'Responsable des services', congregationId: primaryCongId },
    })
    serviceRoleId = serviceRole.id

    await tx.userRoleAssignment.create({
      data: { userId: serviceResponsibleId, roleId: serviceRoleId, kind: 'leader', congregationId: primaryCongId },
    })

    await tx.templateResponsible.create({
      data: { templateId: templateOwnedId, roleId: responsibleRoleId, congregationId: primaryCongId },
    })

    // Two rows on one template. That this insert succeeds at all is the unique
    // index doing its new job — before the 20260901120000 migration the key was
    // (templateId, congregationId) and this would have collided.
    await tx.templateResponsible.create({
      data: {
        templateId: templateOwnedId,
        roleId: serviceRoleId,
        scope: ResponsibilityScope.Service,
        congregationId: primaryCongId,
      },
    })

    // One event per template, each with a service part, so the cross-event guard
    // has a real "other event you are not responsible for" to be pointed at.
    const eventDefaults = {
      startDate: new Date('2026-09-08T17:00:00Z'),
      endDate: new Date('2026-09-08T19:00:00Z'),
      createdById: managerId,
      congregationId: primaryCongId,
    }
    const ownedEvent = await tx.event.create({
      data: { name: 'Owned Event', templateId: templateOwnedId, ...eventDefaults },
    })
    ownedEventId = ownedEvent.id
    const foreignEvent = await tx.event.create({
      data: { name: 'Foreign Event', templateId: templateOtherId, ...eventDefaults },
    })
    foreignEventId = foreignEvent.id

    const ownedServicePart = await tx.eventServicePart.create({
      data: { name: 'Sono', eventId: ownedEventId, congregationId: primaryCongId },
    })
    ownedServicePartId = ownedServicePart.id
    const foreignServicePart = await tx.eventServicePart.create({
      data: { name: 'Sono', eventId: foreignEventId, congregationId: primaryCongId },
    })
    foreignServicePartId = foreignServicePart.id
  })

  await withScope(otherCongId, async tx => {
    const otherCongResp = await tx.userAccount.create({
      data: {
        email: `auth-othercong-resp-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Olga',
        lastname: 'Other',
        active: true,
        congregationId: otherCongId,
      },
    })
    otherCongResponsibleId = otherCongResp.id

    const otherCongTemplate = await tx.eventTemplate.create({
      data: { name: 'Foreign Template', key: `foreign-${ts}`, congregationId: otherCongId },
    })
    templateOtherCongId = otherCongTemplate.id

    const foreignRole = await tx.role.create({
      data: { key: `foreign-responsable-${ts}`, name: 'Responsable etranger', congregationId: otherCongId },
    })
    await tx.userRoleAssignment.create({
      data: { userId: otherCongResponsibleId, roleId: foreignRole.id, kind: 'leader', congregationId: otherCongId },
    })

    await tx.templateResponsible.create({
      data: { templateId: templateOtherCongId, roleId: foreignRole.id, congregationId: otherCongId },
    })
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.eventServicePart.deleteMany({})
      await tx.event.deleteMany({})
      await tx.templateResponsible.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.role.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('getResponsibleTemplateIds (integration)', () => {
  it('returns the templateIds the user is responsible for inside scope', async () => {
    const result = await withScope(primaryCongId, tx => getResponsibleTemplateIds(tx, responsibleId, primaryCongId))
    expect(result).toEqual([templateOwnedId])
  })

  // Pat holds `unrelatedRoleId`, so this is a real refusal on the role check rather than the
  // trivial "holds no roles at all" short-circuit, which the unit test already covers.
  it("returns an empty array for a user whose roles are not any template's responsible", async () => {
    const result = await withScope(primaryCongId, tx => getResponsibleTemplateIds(tx, plainId, primaryCongId))
    expect(result).toEqual([])
  })

  it('does not leak responsibilities from another congregation when scoped', async () => {
    const result = await withScope(primaryCongId, tx =>
      getResponsibleTemplateIds(tx, otherCongResponsibleId, primaryCongId),
    )
    expect(result).toEqual([])
  })
})

describe('canEditEvent (integration)', () => {
  it('returns true for ProgramManager regardless of templateId (incl. freeform)', async () => {
    const onTemplate = await withScope(primaryCongId, tx =>
      canEditEvent(tx, allowOnly(Permission.CanManagePrograms), managerId, templateOtherId, primaryCongId),
    )
    const freeform = await withScope(primaryCongId, tx =>
      canEditEvent(tx, allowOnly(Permission.CanManagePrograms), managerId, null, primaryCongId),
    )
    expect(onTemplate).toBe(true)
    expect(freeform).toBe(true)
  })

  it('returns true for the responsible only on their own template', async () => {
    const owned = await withScope(primaryCongId, tx =>
      canEditEvent(tx, allowNone, responsibleId, templateOwnedId, primaryCongId),
    )
    const foreign = await withScope(primaryCongId, tx =>
      canEditEvent(tx, allowNone, responsibleId, templateOtherId, primaryCongId),
    )
    expect(owned).toBe(true)
    expect(foreign).toBe(false)
  })

  it('returns false for a plain non-manager user on any template', async () => {
    const owned = await withScope(primaryCongId, tx =>
      canEditEvent(tx, allowNone, plainId, templateOwnedId, primaryCongId),
    )
    const other = await withScope(primaryCongId, tx =>
      canEditEvent(tx, allowNone, plainId, templateOtherId, primaryCongId),
    )
    const freeform = await withScope(primaryCongId, tx => canEditEvent(tx, allowNone, plainId, null, primaryCongId))
    expect(owned).toBe(false)
    expect(other).toBe(false)
    expect(freeform).toBe(false)
  })
})

describe('canManageAnyProgram (integration)', () => {
  it('returns true for ProgramManager without consulting responsibles', async () => {
    const result = await withScope(primaryCongId, tx => canManageAnyProgram(tx, allowAll, managerId, primaryCongId))
    expect(result).toBe(true)
  })

  it('returns true for a non-manager who is responsible for at least one template', async () => {
    const result = await withScope(primaryCongId, tx =>
      canManageAnyProgram(tx, allowNone, responsibleId, primaryCongId),
    )
    expect(result).toBe(true)
  })

  it('returns false for a plain non-manager user', async () => {
    const result = await withScope(primaryCongId, tx => canManageAnyProgram(tx, allowNone, plainId, primaryCongId))
    expect(result).toBe(false)
  })
})

// The reason the indirection exists. None of this was expressible while the responsible was
// a direct FK to a UserAccount: a handover meant an UPDATE on every template the outgoing
// holder was named on.
describe('handover through the role (integration)', () => {
  it('moves the delegated access when the role is reseated, without touching the template', async () => {
    const outgoing = await withScope(primaryCongId, tx =>
      tx.userAccount.create({
        data: {
          email: `auth-outgoing-${ts}@test.com`,
          password: 'hashed',
          firstname: 'Otto',
          lastname: 'Outgoing',
          active: true,
          congregationId: primaryCongId,
        },
      }),
    )
    const incoming = await withScope(primaryCongId, tx =>
      tx.userAccount.create({
        data: {
          email: `auth-incoming-${ts}@test.com`,
          password: 'hashed',
          firstname: 'Ida',
          lastname: 'Incoming',
          active: true,
          congregationId: primaryCongId,
        },
      }),
    )

    const role = await withScope(primaryCongId, tx =>
      tx.role.create({
        data: {
          key: `handover-${ts}`,
          name: 'Responsable handover',
          isSinglePerson: true,
          congregationId: primaryCongId,
        },
      }),
    )
    const template = await withScope(primaryCongId, tx =>
      tx.eventTemplate.create({
        data: { name: 'Handover Template', key: `handover-tpl-${ts}`, congregationId: primaryCongId },
      }),
    )

    await withScope(primaryCongId, async tx => {
      await tx.userRoleAssignment.create({
        data: { userId: outgoing.id, roleId: role.id, kind: 'leader', congregationId: primaryCongId },
      })
      await tx.templateResponsible.create({
        data: { templateId: template.id, roleId: role.id, congregationId: primaryCongId },
      })
    })

    expect(
      await withScope(primaryCongId, tx => canEditEvent(tx, allowNone, outgoing.id, template.id, primaryCongId)),
    ).toBe(true)
    expect(
      await withScope(primaryCongId, tx => canEditEvent(tx, allowNone, incoming.id, template.id, primaryCongId)),
    ).toBe(false)

    // The handover: one write on the seat. Nothing touches TemplateResponsible.
    await withScope(primaryCongId, async tx => {
      await tx.userRoleAssignment.deleteMany({ where: { userId: outgoing.id, roleId: role.id } })
      await tx.userRoleAssignment.create({
        data: { userId: incoming.id, roleId: role.id, kind: 'leader', congregationId: primaryCongId },
      })
    })

    expect(
      await withScope(primaryCongId, tx => canEditEvent(tx, allowNone, incoming.id, template.id, primaryCongId)),
    ).toBe(true)
    expect(
      await withScope(primaryCongId, tx => canEditEvent(tx, allowNone, outgoing.id, template.id, primaryCongId)),
    ).toBe(false)

    // The template row is untouched by the handover — that is the whole claim.
    const row = await withScope(primaryCongId, tx =>
      tx.templateResponsible.findFirst({ where: { templateId: template.id } }),
    )
    expect(row?.roleId).toBe(role.id)

    await withScope(primaryCongId, async tx => {
      await tx.templateResponsible.deleteMany({ where: { templateId: template.id } })
      await tx.eventTemplate.deleteMany({ where: { id: template.id } })
      await tx.userRoleAssignment.deleteMany({ where: { roleId: role.id } })
      await tx.role.deleteMany({ where: { id: role.id } })
      await tx.userAccount.deleteMany({ where: { id: { in: [outgoing.id, incoming.id] } } })
    })
  })
})

describe('responsibility scope (integration)', () => {
  it('lets the service responsible act on the service parts of their template', async () => {
    const result = await withScope(primaryCongId, tx =>
      canEditEvent(
        tx,
        allowNone,
        serviceResponsibleId,
        templateOwnedId,
        primaryCongId,
        Permission.CanAssignProgramParts,
        ResponsibilityScope.Service,
      ),
    )
    expect(result).toBe(true)
  })

  // The whole point of the second scope: Sam fills the sono slot and stops there.
  it('refuses the service responsible on the programme', async () => {
    const result = await withScope(primaryCongId, tx =>
      canEditEvent(
        tx,
        allowNone,
        serviceResponsibleId,
        templateOwnedId,
        primaryCongId,
        Permission.CanAssignProgramParts,
      ),
    )
    expect(result).toBe(false)
  })

  it('keeps the programme responsible in charge of the service parts too', async () => {
    const result = await withScope(primaryCongId, tx =>
      canEditEvent(
        tx,
        allowNone,
        responsibleId,
        templateOwnedId,
        primaryCongId,
        Permission.CanAssignProgramParts,
        ResponsibilityScope.Service,
      ),
    )
    expect(result).toBe(true)
  })

  it('does not put the service responsible on the list that gates creating programmes', async () => {
    const programmeScoped = await withScope(primaryCongId, tx =>
      getResponsibleTemplateIds(tx, serviceResponsibleId, primaryCongId),
    )
    const serviceScoped = await withScope(primaryCongId, tx =>
      getResponsibleTemplateIds(tx, serviceResponsibleId, primaryCongId, ResponsibilityScope.Service),
    )
    expect(programmeScoped).toEqual([])
    expect(serviceScoped).toEqual([templateOwnedId])
  })

  it('still allows only one role per scope on a template', async () => {
    await expect(
      withScope(primaryCongId, tx =>
        tx.templateResponsible.create({
          data: {
            templateId: templateOwnedId,
            roleId: unrelatedRoleId,
            scope: ResponsibilityScope.Service,
            congregationId: primaryCongId,
          },
        }),
      ),
    ).rejects.toThrow()
  })

  // The CHECK constraint. An unrecognised scope would match no `scopesCovering`
  // set and so silently delegate to nobody; it has to fail at the write instead.
  it('rejects a scope outside the catalogue', async () => {
    await expect(
      withScope(primaryCongId, tx =>
        tx.$executeRawUnsafe(
          `INSERT INTO "TemplateResponsible" ("templateId", "roleId", "scope", "congregationId")
           VALUES (${templateOwnedId}, ${unrelatedRoleId}, 'territories', ${primaryCongId})`,
        ),
      ),
    ).rejects.toThrow()
  })
})

// The delegation is per template, but the assignment writers look their row up by
// (assignmentId, congregationId) alone. Without this pairing check, Sam — authorised on his
// own event — could post the id of a service part belonging to a template he has nothing to
// do with, and the write would land.
describe('assignmentBelongsToEvent (integration)', () => {
  it('accepts the service part that really sits on the event', async () => {
    const result = await withScope(primaryCongId, tx =>
      assignmentBelongsToEvent(tx, 'service', ownedServicePartId, ownedEventId, primaryCongId),
    )
    expect(result).toBe(true)
  })

  it("refuses another event's service part posted against an authorised event", async () => {
    const authorised = await withScope(primaryCongId, tx =>
      canEditEvent(
        tx,
        allowNone,
        serviceResponsibleId,
        templateOwnedId,
        primaryCongId,
        Permission.CanAssignProgramParts,
        ResponsibilityScope.Service,
      ),
    )
    const belongs = await withScope(primaryCongId, tx =>
      assignmentBelongsToEvent(tx, 'service', foreignServicePartId, ownedEventId, primaryCongId),
    )

    // Authorised on the event, and still refused on the row — which is the point.
    expect(authorised).toBe(true)
    expect(belongs).toBe(false)
  })

  it('does not accept a service part id when asked about a programme part', async () => {
    const result = await withScope(primaryCongId, tx =>
      assignmentBelongsToEvent(tx, 'part', ownedServicePartId, ownedEventId, primaryCongId),
    )
    expect(result).toBe(false)
  })
})
