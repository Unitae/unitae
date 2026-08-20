import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
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
let otherCongResponsibleId: number
let templateOwnedId: number
let templateOtherId: number
let templateOtherCongId: number

const allowAll = (_p: Permission) => true
const allowNone = (_p: Permission) => false
const allowOnly = (allowed: Permission) => (p: Permission) => p === allowed

const { canEditEvent, getResponsibleTemplateIds, canManageAnyProgram } = await import('./events-auth.server')

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

    const owned = await tx.eventTemplate.create({
      data: { name: 'Owned Template', key: `owned-${ts}`, congregationId: primaryCongId },
    })
    templateOwnedId = owned.id

    const otherTpl = await tx.eventTemplate.create({
      data: { name: 'Other Template', key: `other-${ts}`, congregationId: primaryCongId },
    })
    templateOtherId = otherTpl.id

    await tx.templateResponsible.create({
      data: { templateId: templateOwnedId, userId: responsibleId, congregationId: primaryCongId },
    })
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

    await tx.templateResponsible.create({
      data: { templateId: templateOtherCongId, userId: otherCongResponsibleId, congregationId: otherCongId },
    })
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.templateResponsible.deleteMany({})
      await tx.eventTemplate.deleteMany({})
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

  it('returns an empty array for a user with no responsibilities', async () => {
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
      canEditEvent(tx, allowOnly(Permission.ProgramManager), managerId, templateOtherId, primaryCongId),
    )
    const freeform = await withScope(primaryCongId, tx =>
      canEditEvent(tx, allowOnly(Permission.ProgramManager), managerId, null, primaryCongId),
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
