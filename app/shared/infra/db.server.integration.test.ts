import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
// Exercise the real production scope wrapper so this test covers the actual RLS setter.
import { withScope } from './db.server'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

let congregationIdA: number
let congregationIdB: number
const testSuffix = Date.now()

beforeAll(async () => {
  const congA = await testDb.congregation.create({
    data: { name: `Test A ${testSuffix}`, slug: `test-a-${testSuffix}`, active: true },
  })
  const congB = await testDb.congregation.create({
    data: { name: `Test B ${testSuffix}`, slug: `test-b-${testSuffix}`, active: true },
  })
  congregationIdA = congA.id
  congregationIdB = congB.id

  await testDb.userAccount.create({
    data: {
      email: `user-a-${testSuffix}@test.com`,
      password: 'x',
      active: true,
      congregationId: congregationIdA,
      firstname: 'User',
      lastname: 'A',
    },
  })
  await testDb.userAccount.create({
    data: {
      email: `user-b-${testSuffix}@test.com`,
      password: 'x',
      active: true,
      congregationId: congregationIdB,
      firstname: 'User',
      lastname: 'B',
    },
  })
})

afterAll(async () => {
  await testDb.userAccount.deleteMany({ where: { congregationId: { in: [congregationIdA, congregationIdB] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [congregationIdA, congregationIdB] } } })
  await testDb.$disconnect()
})

describe('RLS withScope isolation', () => {
  it('applique app.congregation_id via set_config, tel que lu par les policies RLS', async () => {
    // Isole le setter du reste de la pile RLS : échoue précisément si set_config
    // écrit la mauvaise variable ou une valeur au mauvais format.
    const rows = await withScope(congregationIdA, tx =>
      tx.$queryRawUnsafe<{ value: string }[]>(`SELECT current_setting('app.congregation_id', true) AS value`),
    )

    expect(rows[0].value).toBe(String(congregationIdA))
  })

  it('ne retourne que les utilisateurs de la congrégation A quand le scope est A', async () => {
    // Pas de filtre applicatif : seul RLS restreint les lignes, donc l'assertion teste vraiment le scope.
    const users = await withScope(congregationIdA, tx => {
      return tx.userAccount.findMany()
    })

    expect(users.length).toBeGreaterThanOrEqual(1)
    expect(users.every((u: { congregationId: number }) => u.congregationId === congregationIdA)).toBe(true)
    expect(users.some((u: { congregationId: number }) => u.congregationId === congregationIdB)).toBe(false)
  })

  it('empêche la congrégation A de voir les données de la congrégation B', async () => {
    const users = await withScope(congregationIdA, tx => {
      return tx.userAccount.findMany({ where: { congregationId: congregationIdB } })
    })

    expect(users).toHaveLength(0)
  })

  it('sans scope (unscopedDb), retourne les utilisateurs de toutes les congrégations', async () => {
    const users = await testDb.userAccount.findMany({
      where: { congregationId: { in: [congregationIdA, congregationIdB] } },
    })

    expect(users.length).toBeGreaterThanOrEqual(2)
  })
})
