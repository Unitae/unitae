import type { PrismaClient } from '~/database/generated/client'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

export function createTestCongregation(db: PrismaClient, overrides: Record<string, unknown> = {}) {
  const suffix = Date.now()
  return db.congregation.create({
    data: { name: `Test Congregation ${suffix}`, slug: `test-${suffix}`, active: true, ...overrides },
  })
}

// Splits Member-shaped fields (isPublisher, type, isMale, isHelder, …) into a
// Member row, account-shaped fields (email, password, active, …) into a
// UserAccount, and links them. Returns the UserAccount with `member` populated
// so existing tests can read either side.
export async function createTestUser(
  db: PrismaClient,
  congregationId: number,
  overrides: Record<string, unknown> = {},
) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const memberFieldKeys = [
    'firstname',
    'lastname',
    'isMale',
    'birthDate',
    'phone',
    'address',
    'isPublisher',
    'type',
    'baptismDate',
    'isAnointed',
    'isHelder',
    'isServant',
    'publisherGroupId',
    'leftAt',
    'anonymizedAt',
  ] as const

  const memberData: Record<string, unknown> = {
    firstname: 'Test',
    lastname: 'User',
    isPublisher: true,
  }
  const accountData: Record<string, unknown> = {
    email: `user-${suffix}@test.com`,
    password: 'x',
    active: true,
  }

  for (const [key, value] of Object.entries(overrides)) {
    if ((memberFieldKeys as readonly string[]).includes(key)) {
      memberData[key] = value
    } else {
      accountData[key] = value
    }
  }

  // Create a Member only when at least one publisher-shaped field is
  // explicitly set (or the override has firstname/lastname). Tests that
  // create Account-only admins pass none of those, so we skip Member.
  const hasMemberSignal = Object.keys(overrides).some(k => (memberFieldKeys as readonly string[]).includes(k))

  let memberId: number | null = null
  if (hasMemberSignal) {
    // biome-ignore lint/suspicious/noExplicitAny: factory accepts arbitrary overrides
    const member = await db.member.create({ data: { ...memberData, congregationId } as any })
    memberId = member.id
  } else {
    // Test asked for a plain account — leave display name on UserAccount fallback
    accountData.firstname = memberData.firstname
    accountData.lastname = memberData.lastname
  }

  const account = await db.userAccount.create({
    // biome-ignore lint/suspicious/noExplicitAny: factory accepts arbitrary overrides
    data: { ...accountData, memberId, congregationId } as any,
    include: { member: true },
  })
  return account
}

export function createTestMember(db: PrismaClient, congregationId: number, overrides: Record<string, unknown> = {}) {
  return db.member.create({
    data: {
      firstname: 'Test',
      lastname: 'Member',
      isPublisher: true,
      congregationId,
      ...overrides,
    },
  })
}

export function createTestTerritory(db: PrismaClient, congregationId: number, overrides: Record<string, unknown> = {}) {
  const suffix = Date.now()
  return db.territory.create({
    data: { number: `T-${suffix}`, type: TerritoryKindKey.Classical, congregationId, ...overrides },
  })
}
