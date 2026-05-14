import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { Permission } from '~/shared/types/permission'

const { seedPermissions } = await import('~/shared/domain/setup.server')
const { resolveEffectivePermissions, resolveEffectiveRoleIds, findAccountsWithPermission, findMembersWithAnyRole } =
  await import('./permissions.server')

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const ts = Date.now()
let congregationId: number
let memberRoleId: number
let accountRoleId: number
let memberOnlyAccountId: number
let accountOnlyAccountId: number
let directGrantAccountId: number
let noMemberAccountId: number
let memberOnlyMemberId: number
let accountOnlyMemberId: number
let leaverMemberId: number

beforeAll(async () => {
  await seedPermissions(testDb)

  const cong = await testDb.congregation.create({
    data: { name: `Perms ${ts}`, slug: `perms-${ts}`, active: true },
  })
  congregationId = cong.id

  // Two roles, both granting BoardViewer. The first will be wired through
  // MemberRoleAssignment (identity-role path); the second through
  // UserRoleAssignment (account-role path).
  const memberRole = await testDb.role.create({
    data: { key: `member-role-${ts}`, isBuiltIn: false, congregationId },
  })
  memberRoleId = memberRole.id

  const accountRole = await testDb.role.create({
    data: { key: `account-role-${ts}`, isBuiltIn: false, congregationId },
  })
  accountRoleId = accountRole.id

  const boardViewer = await testDb.permission.findUniqueOrThrow({ where: { key: Permission.BoardViewer } })
  await testDb.rolePermission.createMany({
    data: [
      { roleId: memberRoleId, permissionId: boardViewer.id, congregationId },
      { roleId: accountRoleId, permissionId: boardViewer.id, congregationId },
    ],
  })

  // Account 1: BoardViewer reached only via MemberRoleAssignment (publisher-like path).
  const memberOnlyMember = await testDb.member.create({
    data: { firstname: 'Mem', lastname: 'Only', isPublisher: true, congregationId },
  })
  memberOnlyMemberId = memberOnlyMember.id
  const memberOnlyAccount = await testDb.userAccount.create({
    data: {
      email: `perms-mem-${ts}@test.com`,
      password: 'h',
      active: true,
      memberId: memberOnlyMember.id,
      congregationId,
    },
  })
  memberOnlyAccountId = memberOnlyAccount.id
  await testDb.memberRoleAssignment.create({
    data: { memberId: memberOnlyMember.id, roleId: memberRoleId, congregationId },
  })

  // Account 2: BoardViewer reached only via UserRoleAssignment.
  const accountOnlyMember = await testDb.member.create({
    data: { firstname: 'Acc', lastname: 'Only', isPublisher: false, congregationId },
  })
  accountOnlyMemberId = accountOnlyMember.id
  const accountOnlyAccount = await testDb.userAccount.create({
    data: {
      email: `perms-acc-${ts}@test.com`,
      password: 'h',
      active: true,
      memberId: accountOnlyMember.id,
      congregationId,
    },
  })
  accountOnlyAccountId = accountOnlyAccount.id
  await testDb.userRoleAssignment.create({
    data: { userId: accountOnlyAccount.id, roleId: accountRoleId, congregationId },
  })

  // A Member that holds memberRoleId but has left the congregation. Used to
  // verify findMembersWithAnyRole excludes leavers.
  const leaverMember = await testDb.member.create({
    data: {
      firstname: 'Left',
      lastname: 'Member',
      isPublisher: true,
      leftAt: new Date('2024-01-01'),
      congregationId,
    },
  })
  leaverMemberId = leaverMember.id
  await testDb.memberRoleAssignment.create({
    data: { memberId: leaverMember.id, roleId: memberRoleId, congregationId },
  })

  // Account 3: BoardViewer reached only via direct CongregationUserPermission.
  const directGrantAccount = await testDb.userAccount.create({
    data: {
      email: `perms-direct-${ts}@test.com`,
      password: 'h',
      active: true,
      firstname: 'Direct',
      lastname: 'Grant',
      congregationId,
    },
  })
  directGrantAccountId = directGrantAccount.id
  await testDb.congregationUserPermission.create({
    data: { userId: directGrantAccount.id, permissionId: boardViewer.id, congregationId },
  })

  // Account 4: no linked Member, no grants. Used to verify helpers don't crash
  // and return empty results.
  const noMemberAccount = await testDb.userAccount.create({
    data: {
      email: `perms-none-${ts}@test.com`,
      password: 'h',
      active: true,
      firstname: 'No',
      lastname: 'Grants',
      congregationId,
    },
  })
  noMemberAccountId = noMemberAccount.id
})

afterAll(async () => {
  await testDb.congregationUserPermission.deleteMany({ where: { congregationId } })
  await testDb.memberRoleAssignment.deleteMany({ where: { congregationId } })
  await testDb.userRoleAssignment.deleteMany({ where: { congregationId } })
  await testDb.rolePermission.deleteMany({ where: { congregationId } })
  await testDb.role.deleteMany({ where: { congregationId } })
  await testDb.userAccount.deleteMany({ where: { congregationId } })
  await testDb.member.deleteMany({ where: { congregationId } })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('resolveEffectivePermissions (integration)', () => {
  it('grants BoardViewer through MemberRoleAssignment (publisher-style path)', async () => {
    const perms = await resolveEffectivePermissions(memberOnlyAccountId, congregationId)
    expect(perms.has(Permission.BoardViewer)).toBe(true)
  })

  it('grants BoardViewer through UserRoleAssignment (custom account role)', async () => {
    const perms = await resolveEffectivePermissions(accountOnlyAccountId, congregationId)
    expect(perms.has(Permission.BoardViewer)).toBe(true)
  })

  it('grants BoardViewer through a direct CongregationUserPermission grant', async () => {
    const perms = await resolveEffectivePermissions(directGrantAccountId, congregationId)
    expect(perms.has(Permission.BoardViewer)).toBe(true)
  })

  it('returns an empty set for an account with no grants and no linked Member', async () => {
    const perms = await resolveEffectivePermissions(noMemberAccountId, congregationId)
    expect(perms.size).toBe(0)
  })
})

describe('resolveEffectiveRoleIds (integration)', () => {
  it('returns the role assigned via MemberRoleAssignment', async () => {
    const roleIds = await resolveEffectiveRoleIds(testDb, memberOnlyAccountId, congregationId)
    expect(roleIds).toEqual([memberRoleId])
  })

  it('returns the role assigned via UserRoleAssignment', async () => {
    const roleIds = await resolveEffectiveRoleIds(testDb, accountOnlyAccountId, congregationId)
    expect(roleIds).toEqual([accountRoleId])
  })

  it('returns an empty list for an account with no role assignments', async () => {
    const roleIds = await resolveEffectiveRoleIds(testDb, noMemberAccountId, congregationId)
    expect(roleIds).toEqual([])
  })
})

describe('findAccountsWithPermission (integration)', () => {
  it('returns every account that holds the permission via any source', async () => {
    const accounts = await findAccountsWithPermission(testDb, congregationId, Permission.BoardViewer)
    const ids = accounts.map(a => a.id).sort((a, b) => a - b)
    const expected = [memberOnlyAccountId, accountOnlyAccountId, directGrantAccountId].sort((a, b) => a - b)
    expect(ids).toEqual(expected)
  })

  it('does not return accounts that lack the permission', async () => {
    const accounts = await findAccountsWithPermission(testDb, congregationId, Permission.BoardViewer)
    expect(accounts.some(a => a.id === noMemberAccountId)).toBe(false)
  })
})

describe('findMembersWithAnyRole (integration)', () => {
  it('returns the member when the role is assigned via MemberRoleAssignment', async () => {
    const ids = await findMembersWithAnyRole(testDb, [memberRoleId], congregationId)
    expect(ids).toContain(memberOnlyMemberId)
  })

  it('returns the member when the role is assigned via UserRoleAssignment on the linked account', async () => {
    const ids = await findMembersWithAnyRole(testDb, [accountRoleId], congregationId)
    expect(ids).toEqual([accountOnlyMemberId])
  })

  it('unions both sources when both role IDs are queried at once', async () => {
    const ids = await findMembersWithAnyRole(testDb, [memberRoleId, accountRoleId], congregationId)
    expect(ids.sort((a, b) => a - b)).toEqual([memberOnlyMemberId, accountOnlyMemberId].sort((a, b) => a - b))
  })

  it('excludes leavers even when they hold the role', async () => {
    const ids = await findMembersWithAnyRole(testDb, [memberRoleId], congregationId)
    expect(ids).not.toContain(leaverMemberId)
  })

  it('returns an empty array when roleIds is empty', async () => {
    const ids = await findMembersWithAnyRole(testDb, [], congregationId)
    expect(ids).toEqual([])
  })
})
