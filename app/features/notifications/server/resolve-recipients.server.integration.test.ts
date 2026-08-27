import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { seedPermissions } = await import('~/shared/domain/setup.server')
const { resolveRecipients } = await import('./resolve-recipients.server')

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const ts = Date.now()
let congregationId: number
let customRoleAccountId: number

beforeAll(async () => {
  await seedPermissions(testDb)

  const cong = await testDb.congregation.create({
    data: { name: `Recip ${ts}`, slug: `recip-${ts}`, active: true },
  })
  congregationId = cong.id

  // A custom account-scoped role that grants BoardValidator.
  const customRole = await testDb.role.create({
    data: { key: `custom-validator-${ts}`, isBuiltIn: false, congregationId },
  })
  const boardValidator = await testDb.permission.findUniqueOrThrow({
    where: { key: Permission.CanReviewBoardDocuments },
  })
  await testDb.rolePermission.create({
    data: { roleId: customRole.id, permissionId: boardValidator.id, congregationId },
  })

  // Account whose ONLY path to BoardValidator is a custom UserRoleAssignment.
  const account = await testDb.userAccount.create({
    data: {
      email: `recip-custom-${ts}@test.com`,
      password: 'h',
      firstname: 'Custom',
      lastname: 'Only',
      active: true,
      congregationId,
    },
  })
  customRoleAccountId = account.id
  await testDb.userRoleAssignment.create({
    data: { userId: account.id, roleId: customRole.id, congregationId },
  })
})

afterAll(async () => {
  await testDb.userRoleAssignment.deleteMany({ where: { congregationId } })
  await testDb.rolePermission.deleteMany({ where: { congregationId } })
  await testDb.role.deleteMany({ where: { congregationId } })
  await testDb.userAccount.deleteMany({ where: { congregationId } })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('resolveRecipients (integration)', () => {
  it('returns an account whose only permission source is a custom UserRoleAssignment', async () => {
    const recipients = await resolveRecipients(
      testDb,
      congregationId,
      Permission.CanReviewBoardDocuments,
      'board.document.created',
    )

    const userIds = recipients.map(r => r.userId)
    expect(userIds).toContain(customRoleAccountId)
  })
})
