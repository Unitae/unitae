import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// « Retirer la connexion » on a record deletes the login, by the same rules as deleting it from Réglages: it must not
// end in a foreign-key error on the events the login created. A record's absences are the person's, so they stay on
// the record without the login; its other events lose their author and stay what they were.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
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

const { unlinkAccountFromMember } = await import('./unlink-account-from-member.server')
const { Permission } = await import('~/shared/types/permission')

const ADMIN = new Set<string>([Permission.CanDoAnything])
const ts = Date.now()
const ids = { cong: 0, admin: 0, dayOffTemplate: 0, meetingTemplate: 0 }
const DAY = new Date('2027-01-12T18:00:00Z')

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({ data: { name: `Unlink ${ts}`, slug: `unlink-${ts}`, active: true } })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    const adminRole = await tx.role.create({ data: { key: 'admin', isBuiltIn: true, congregationId } })
    ids.admin = (
      await tx.userAccount.create({ data: { email: `admin-${ts}@test.com`, password: 'x', congregationId } })
    ).id
    await tx.userRoleAssignment.create({ data: { userId: ids.admin, roleId: adminRole.id, congregationId } })
    ids.dayOffTemplate = (
      await tx.eventTemplate.create({ data: { name: 'Absence', key: 'day-off', congregationId } })
    ).id
    ids.meetingTemplate = (
      await tx.eventTemplate.create({ data: { name: 'Réunion de semaine', key: 'midweek-meeting', congregationId } })
    ).id
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
      await tx.role.deleteMany({})
    })
    await testDb.auditLog.deleteMany({ where: { congregationId: ids.cong } })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

/** A record with a login, an absence when asked, and an empty meeting the login made by hand. */
function personWithLogin(name: string, { absence }: { absence: boolean }) {
  return withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    const memberId = (await tx.member.create({ data: { firstname: name, lastname: 'TEST', congregationId } })).id
    const accountId = (
      await tx.userAccount.create({
        data: { email: `${name}-${ts}@test.com`, password: 'x', memberId, congregationId },
      })
    ).id
    const event = (templateId: number) =>
      tx.event.create({
        data: { name, startDate: DAY, endDate: DAY, templateId, createdById: accountId, congregationId },
      })
    if (absence) {
      await tx.absence.create({ data: { startDate: DAY, endDate: DAY, memberId, accountId, congregationId } })
    }
    const meetingId = (await event(ids.meetingTemplate)).id
    return { memberId, accountId, meetingId }
  })
}

const unlink = (memberId: number) =>
  withScope(ids.cong, tx => unlinkAccountFromMember(tx, memberId as never, ids.cong, ids.admin, ADMIN))

const event = (id: number) =>
  withScope(ids.cong, tx => tx.event.findFirst({ where: { id }, select: { createdById: true, origin: true } }))

describe('unlinkAccountFromMember and the events the login created', () => {
  it('removes a login that made a programme, clearing its author', async () => {
    const { memberId, accountId, meetingId } = await personWithLogin('Retrait', { absence: false })

    expect(await unlink(memberId)).toEqual({ accountId, email: `Retrait-${ts}@test.com` })
    expect(await event(meetingId)).toEqual({ createdById: null, origin: 'manual' })
  })

  // Taking the login away leaves the person's absences with them: on the record, without the login.
  it('removes a login whose record has absences, which stay on the record', async () => {
    const { memberId, accountId, meetingId } = await personWithLogin('Absent', { absence: true })

    expect(await unlink(memberId)).toEqual({ accountId, email: `Absent-${ts}@test.com` })
    expect(await event(meetingId)).toEqual({ createdById: null, origin: 'manual' })
    const absences = await withScope(ids.cong, tx =>
      tx.absence.findMany({ where: { memberId }, select: { accountId: true } }),
    )
    expect(absences).toEqual([{ accountId: null }])
  })
})
