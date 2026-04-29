import { PrismaClient } from '~/database/generated/client'

export function createTestCongregation(db: PrismaClient, overrides: Record<string, unknown> = {}) {
  const suffix = Date.now()
  return db.congregation.create({
    data: { name: `Test Congregation ${suffix}`, slug: `test-${suffix}`, active: true, ...overrides },
  })
}

export function createTestUser(
  db: PrismaClient,
  congregationId: number,
  overrides: Record<string, unknown> = {},
) {
  const suffix = Date.now()
  return db.user.create({
    data: {
      email: `user-${suffix}@test.com`,
      password: 'x',
      active: true,
      congregationId,
      firstname: 'Test',
      lastname: 'User',
      ...overrides,
    },
  })
}

export function createTestTerritory(
  db: PrismaClient,
  congregationId: number,
  overrides: Record<string, unknown> = {},
) {
  const suffix = Date.now()
  return db.territory.create({
    data: { number: `T-${suffix}`, type: 'doors-to-doors', congregationId, ...overrides },
  })
}
