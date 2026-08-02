import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { MemberId } from '~/shared/types/branded'

// Audit is fire-and-forget; capture calls without touching the DB.
const auditMock = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  audit: (...args: unknown[]) => auditMock(...args),
  auditInTransaction: vi.fn(),
  AuditAction: {
    EmergencyInfoUpdated: 'emergency_info.updated',
    UserAnonymized: 'user.anonymized',
  },
}))
vi.mock('~/features/authentication', () => ({ createPasswordResetToken: vi.fn() }))

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
let congId: number

const { updateEmergencyInfo, purgeEmergencyContacts } = await import('./emergency-info.aggregate')
const memberAggregate = await import('./member.aggregate')
const { seedBuiltInRoles } = await import('~/shared/domain/setup.server')

function createMember(firstname: string): Promise<number> {
  return withScope(congId, async tx => {
    const member = await tx.member.create({
      data: { firstname, lastname: 'Test', congregationId: congId },
      select: { id: true },
    })
    return member.id
  })
}

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `EmergAgg ${ts}`, slug: `emerg-agg-${ts}`, active: true },
  })
  congId = cong.id
  await withScope(congId, tx => seedBuiltInRoles(tx, congId))
})

afterAll(async () => {
  await withScope(congId, async tx => {
    await tx.emergencyContact.deleteMany({})
    await tx.memberRoleAssignment.deleteMany({})
    await tx.member.deleteMany({})
    await tx.dataDeletionRecord.deleteMany({})
    await tx.role.deleteMany({})
  })
  await testDb.congregation.delete({ where: { id: congId } })
  await testDb.$disconnect()
})

describe('updateEmergencyInfo (integration)', () => {
  it('persists the flags and the contact list', async () => {
    const memberId = await createMember('Alice')

    await withScope(congId, tx =>
      updateEmergencyInfo(tx, memberId, congId, 1, {
        dpaCardUpToDate: true,
        survivalBackpackReady: true,
        contacts: [
          { name: 'Marie Dupont', relationship: 'conjoint', phone: '0612345678' },
          { name: 'Paul Martin', relationship: 'ami', phone: '' },
        ],
      }),
    )

    const stored = await withScope(congId, tx =>
      tx.member.findFirst({
        where: { id: memberId },
        select: {
          dpaCardUpToDate: true,
          survivalBackpackReady: true,
          emergencyContacts: { select: { name: true, relationship: true }, orderBy: { id: 'asc' } },
        },
      }),
    )

    expect(stored?.dpaCardUpToDate).toBe(true)
    expect(stored?.survivalBackpackReady).toBe(true)
    expect(stored?.emergencyContacts).toHaveLength(2)
    expect(stored?.emergencyContacts[0]).toMatchObject({ name: 'Marie Dupont', relationship: 'conjoint' })
  })

  it('replaces the whole contact set on re-save', async () => {
    const memberId = await createMember('Bob')

    await withScope(congId, tx =>
      updateEmergencyInfo(tx, memberId, congId, 1, {
        dpaCardUpToDate: false,
        survivalBackpackReady: false,
        contacts: [{ name: 'First', relationship: '', phone: '' }],
      }),
    )
    await withScope(congId, tx =>
      updateEmergencyInfo(tx, memberId, congId, 1, {
        dpaCardUpToDate: false,
        survivalBackpackReady: false,
        contacts: [{ name: 'Second', relationship: '', phone: '' }],
      }),
    )

    const contacts = await withScope(congId, tx =>
      tx.emergencyContact.findMany({ where: { memberId }, select: { name: true } }),
    )
    expect(contacts.map(c => c.name)).toEqual(['Second'])
  })
})

describe('anonymize purges emergency contacts (regression)', () => {
  it('removes every contact when the member is anonymized', async () => {
    const memberId = await createMember('Carol')
    await withScope(congId, tx =>
      updateEmergencyInfo(tx, memberId, congId, 1, {
        dpaCardUpToDate: true,
        survivalBackpackReady: true,
        contacts: [{ name: 'Next of kin', relationship: 'famille', phone: '0700000000' }],
      }),
    )

    await withScope(congId, tx => memberAggregate.anonymize(tx, memberId as MemberId, congId, 1))

    const remaining = await withScope(congId, tx => tx.emergencyContact.count({ where: { memberId } }))
    expect(remaining).toBe(0)
  })
})

describe('purgeEmergencyContacts (integration)', () => {
  it('deletes all contacts for the member', async () => {
    const memberId = await createMember('Dan')
    await withScope(congId, tx =>
      updateEmergencyInfo(tx, memberId, congId, 1, {
        dpaCardUpToDate: false,
        survivalBackpackReady: false,
        contacts: [{ name: 'X', relationship: '', phone: '' }],
      }),
    )

    await withScope(congId, tx => purgeEmergencyContacts(tx, memberId, congId))

    const remaining = await withScope(congId, tx => tx.emergencyContact.count({ where: { memberId } }))
    expect(remaining).toBe(0)
  })
})
