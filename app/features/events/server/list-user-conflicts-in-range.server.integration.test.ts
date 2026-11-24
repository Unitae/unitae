import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { settleFixtureSchedules } from '~/tests/helpers/settle-fixture-schedules'

// An absent publisher sees the assignments their absence clashes with. Several of one meeting are listed in the
// programme's order — its parts, then its services — not in whatever order the table returns them.

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

const { listUserConflictsInRange } = await import('./list-user-conflicts-in-range.server')

const ts = Date.now()
const ids = { cong: 0, member: 0 }
const DAY = new Date('2027-03-16T18:00:00Z')

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({ data: { name: `Conflicts ${ts}`, slug: `conflicts-${ts}`, active: true } })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    ids.member = (await tx.member.create({ data: { firstname: 'Pierre', lastname: 'LEROY', congregationId } })).id
    const event = await tx.event.create({
      data: { name: 'Réunion', startDate: DAY, endDate: DAY, status: 'released', congregationId },
    })
    const clash = { eventId: event.id, assigneeId: ids.member, hasConflict: true, congregationId }
    // Created in an order the programme does not follow.
    for (const [name, order] of [
      ['Cantique de conclusion', 20],
      ['Lecture de la Bible', 10],
    ] as const) {
      await tx.eventPart.create({ data: { name, order, ...clash } })
    }
    for (const [name, order] of [
      ['Nettoyage', 5],
      ['Accueil', 0],
    ] as const) {
      await tx.eventServicePart.create({ data: { name, order, ...clash } })
    }
    await settleFixtureSchedules(tx as never, congregationId)

    // Each schedule's template names its own responsible: the programme's role held on an account, the duties' role
    // on a publisher record.
    const programmeRole = await tx.role.create({ data: { key: `prog-${ts}`, name: 'Programme', congregationId } })
    const dutyRole = await tx.role.create({ data: { key: `duty-${ts}`, name: 'Services', congregationId } })
    const account = await tx.userAccount.create({
      data: { email: `prog-${ts}@test.com`, password: 'x', firstname: 'Julien', lastname: 'GIRARD', congregationId },
    })
    await tx.userRoleAssignment.create({ data: { userId: account.id, roleId: programmeRole.id, congregationId } })
    const holder = await tx.member.create({ data: { firstname: 'Philippe', lastname: 'MARTIN', congregationId } })
    await tx.memberRoleAssignment.create({ data: { memberId: holder.id, roleId: dutyRole.id, congregationId } })
    for (const [kind, roleId] of [
      ['programme', programmeRole.id],
      ['duty', dutyRole.id],
    ] as const) {
      const template = await tx.scheduleTemplate.create({
        data: { name: kind, kind, responsibleRoleId: roleId, congregationId },
      })
      await tx.schedule.updateMany({ where: { eventId: event.id, kind }, data: { scheduleTemplateId: template.id } })
    }
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.event.deleteMany({})
      await tx.scheduleTemplate.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.memberRoleAssignment.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.role.deleteMany({})
      await tx.member.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

describe('listUserConflictsInRange', () => {
  it('lists one meeting’s clashing parts then services, each in the programme’s order', async () => {
    const conflicts = await withScope(ids.cong, tx =>
      listUserConflictsInRange(tx, ids.member, new Date('2027-03-15T00:00:00Z'), new Date('2027-03-17T00:00:00Z')),
    )

    expect(conflicts.map(conflict => conflict.assignmentName)).toEqual([
      'Lecture de la Bible',
      'Cantique de conclusion',
      'Accueil',
      'Nettoyage',
    ])
  })

  it('names, on each line, the holders of its own schedule template’s responsible', async () => {
    const conflicts = await withScope(ids.cong, tx =>
      listUserConflictsInRange(tx, ids.member, new Date('2027-03-15T00:00:00Z'), new Date('2027-03-17T00:00:00Z')),
    )

    expect(conflicts.map(conflict => [conflict.assignmentName, conflict.responsibleName])).toEqual([
      ['Lecture de la Bible', 'Julien GIRARD'],
      ['Cantique de conclusion', 'Julien GIRARD'],
      ['Accueil', 'Philippe MARTIN'],
      ['Nettoyage', 'Philippe MARTIN'],
    ])
  })
})
