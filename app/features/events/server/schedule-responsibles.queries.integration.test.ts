import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// A schedule's responsible as the event page shows it (D37): the role, then its titulaire, then its adjoints — every
// seat, on the record or on an account without one (spec §5.4). Against the database, in a congregation of its own,
// rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { listScheduleResponsibles } = await import('./schedule-responsibles.queries')

class Rollback extends Error {}

async function inCongregation(fn: (db: TransactionClient, congregationId: number) => Promise<void>) {
  try {
    await testDb.$transaction(async tx => {
      const stamp = `resp-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      await fn(tx as unknown as TransactionClient, congregationId)
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('listScheduleResponsibles', () => {
  it('names the role, then its titulaire, then its adjoints, then its other holders', async () => {
    await inCongregation(async (db, congregationId) => {
      const role = await db.role.create({
        data: { key: 'services-lead', name: 'Responsable des services', congregationId },
      })
      const member = (firstname: string, lastname: string) =>
        db.member.create({ data: { firstname, lastname, congregationId } })
      const deputy = await member('Damien', 'Blanchard')
      const leader = await member('Patrick', 'Fontaine')
      const plain = await member('Luc', 'Roux')
      for (const [memberId, kind] of [
        [deputy.id, 'deputy'],
        [plain.id, 'member'],
        [leader.id, 'leader'],
      ] as const) {
        await db.memberRoleAssignment.create({ data: { memberId, roleId: role.id, kind, congregationId } })
      }
      // An account without a record holds its roles on the account.
      const account = await db.userAccount.create({
        data: {
          email: `nora-${congregationId}@test.com`,
          password: 'x',
          firstname: 'Nora',
          lastname: 'Petit',
          congregationId,
        },
      })
      await db.userRoleAssignment.create({
        data: { userId: account.id, roleId: role.id, kind: 'deputy', congregationId },
      })

      const responsibles = await listScheduleResponsibles(db, [role.id], congregationId)

      expect(responsibles.get(role.id)).toEqual({
        role: { key: 'services-lead', name: 'Responsable des services' },
        holders: [
          { memberId: leader.id, accountId: null, firstname: 'Patrick', lastname: 'Fontaine', seat: 'leader' },
          { memberId: deputy.id, accountId: null, firstname: 'Damien', lastname: 'Blanchard', seat: 'deputy' },
          { memberId: null, accountId: account.id, firstname: 'Nora', lastname: 'Petit', seat: 'deputy' },
          { memberId: plain.id, accountId: null, firstname: 'Luc', lastname: 'Roux', seat: 'member' },
        ],
      })
    })
  })

  it('leaves out a member who left, and an account that has a record holds its roles on the record', async () => {
    await inCongregation(async (db, congregationId) => {
      const role = await db.role.create({ data: { key: 'lead', name: 'Lead', congregationId } })
      const gone = await db.member.create({
        data: { firstname: 'Ana', lastname: 'Gone', leftAt: new Date(), congregationId },
      })
      await db.memberRoleAssignment.create({
        data: { memberId: gone.id, roleId: role.id, kind: 'leader', congregationId },
      })
      const withRecord = await db.member.create({ data: { firstname: 'Rémi', lastname: 'Record', congregationId } })
      const account = await db.userAccount.create({
        data: { email: `remi-${congregationId}@test.com`, password: 'x', memberId: withRecord.id, congregationId },
      })
      // A stray account-level assignment of an account with a record is not how its roles are held.
      await db.userRoleAssignment.create({
        data: { userId: account.id, roleId: role.id, kind: 'deputy', congregationId },
      })

      expect((await listScheduleResponsibles(db, [role.id], congregationId)).get(role.id)?.holders).toEqual([])
    })
  })

  it('reads nothing for no role, and leaves out a role of another congregation', async () => {
    await inCongregation(async (db, congregationId) => {
      const role = await db.role.create({ data: { key: 'lead', name: 'Lead', congregationId } })
      expect(await listScheduleResponsibles(db, [], congregationId)).toEqual(new Map())
      expect((await listScheduleResponsibles(db, [role.id], congregationId + 1)).size).toBe(0)
      expect(await listScheduleResponsibles(db, [role.id], congregationId)).toEqual(
        new Map([[role.id, { role: { key: 'lead', name: 'Lead' }, holders: [] }]]),
      )
    })
  })
})
