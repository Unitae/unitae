import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// The migration that gives every congregation the service committee roles.
//
// Reads the shipped migration.sql rather than retyping it — a test with its own copy of the SQL
// keeps passing after someone edits the file it is supposed to be guarding.

const MIGRATION = join(
  process.cwd(),
  'app/database/migrations/20260830000000_add_service_committee_roles/migration.sql',
)

const POST_KEYS = ['service-committee', 'coordinator', 'secretary', 'service-overseer']

const testDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DB_URL }) })

class Rollback extends Error {}

function migrationStatements(): string[] {
  return readFileSync(MIGRATION, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)
}

interface Snapshot {
  /** Roles created for a congregation that had none of them. */
  fresh: { key: string; isBuiltIn: boolean; name: string | null; showInOrganigram: boolean }[]
  /** The pre-existing custom role that collided on `coordinator`. */
  collided: { id: number; isBuiltIn: boolean; name: string | null } | null
  /** Assignments still attached to the collided role after the migration. */
  collidedAssignments: number
  /** Row counts after running the statements twice. */
  countAfterFirstRun: number
  countAfterSecondRun: number
}

let snapshotPromise: Promise<Snapshot> | null = null

/** Memoised: every `it` reads one snapshot rather than re-running an expensive transaction. */
function snapshot(): Promise<Snapshot> {
  snapshotPromise ??= buildWithRetry()
  return snapshotPromise
}

/**
 * The migration's INSERT … SELECT covers every congregation in the database, not just this
 * file's two. Under the parallel integration run, another worker can delete its own
 * congregation between that statement's snapshot and its FK check, which fails the replay on
 * `Role_congregationId_fkey`. That race is a property of the shared test database, not of the
 * migration — in production it runs alone — so the replay retries instead of failing the suite.
 */
async function buildWithRetry(attempts = 3): Promise<Snapshot> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await build()
    } catch (error) {
      // The constraint name lands in the message itself (verified against the P2010 error the
      // pg adapter raises) — matched there rather than via JSON.stringify, which could itself
      // throw on an unserialisable error and replace the failure being reported.
      const racy = error instanceof Error && error.message.includes('Role_congregationId_fkey')
      if (!racy || attempt >= attempts) throw error
    }
  }
}

async function build(): Promise<Snapshot> {
  const statements = migrationStatements()
  const suffix = Date.now()
  let captured: Snapshot | null = null

  try {
    await testDb.$transaction(async tx => {
      const plain = await tx.congregation.create({
        data: { name: `mig-plain-${suffix}`, slug: `mig-plain-${suffix}` },
        select: { id: true },
      })
      const collider = await tx.congregation.create({
        data: { name: `mig-collide-${suffix}`, slug: `mig-collide-${suffix}` },
        select: { id: true },
      })

      // A congregation that already uses the `coordinator` key for a role of its own, with a
      // person assigned to it. This is the case that must not lose data.
      const existing = await tx.role.create({
        data: { key: 'coordinator', name: 'Coordinator', isBuiltIn: false, congregationId: collider.id },
        select: { id: true },
      })
      const account = await tx.userAccount.create({
        data: {
          email: `mig-${suffix}@example.test`,
          password: 'x',
          firstname: 'A',
          lastname: 'B',
          congregationId: collider.id,
        },
        select: { id: true },
      })
      await tx.userRoleAssignment.create({
        data: { userId: account.id, roleId: existing.id, congregationId: collider.id },
      })

      for (const statement of statements) await tx.$executeRawUnsafe(statement)

      const countAfterFirstRun = await tx.role.count({
        where: { congregationId: plain.id, key: { in: POST_KEYS } },
      })
      for (const statement of statements) await tx.$executeRawUnsafe(statement)
      const countAfterSecondRun = await tx.role.count({
        where: { congregationId: plain.id, key: { in: POST_KEYS } },
      })

      captured = {
        fresh: await tx.role.findMany({
          where: { congregationId: plain.id, key: { in: POST_KEYS } },
          select: { key: true, isBuiltIn: true, name: true, showInOrganigram: true },
          orderBy: { key: 'asc' },
        }),
        collided: await tx.role.findUnique({
          where: { key_congregationId: { key: 'coordinator', congregationId: collider.id } },
          select: { id: true, isBuiltIn: true, name: true },
        }),
        collidedAssignments: await tx.userRoleAssignment.count({ where: { roleId: existing.id } }),
        countAfterFirstRun,
        countAfterSecondRun,
      }

      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }

  if (!captured) throw new Error('fixture did not capture a snapshot')
  return captured
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('add-service-committee-roles', () => {
  it('creates all four posts for a congregation that had none', async () => {
    const { fresh } = await snapshot()

    // Sanity-pin the count: a before/after check passes just as happily on two empty sets.
    expect(fresh).toHaveLength(4)
    expect(fresh.map(role => role.key)).toEqual(['coordinator', 'secretary', 'service-committee', 'service-overseer'])
  })

  it('stores no name, so the display string stays localisable', async () => {
    const { fresh } = await snapshot()

    expect(fresh.every(role => role.name === null)).toBe(true)
  })

  it('creates them undeletable', async () => {
    const { fresh } = await snapshot()

    expect(fresh.every(role => role.isBuiltIn)).toBe(true)
  })

  it('leaves them out of the chart — existing congregations adopt instead', async () => {
    const { fresh } = await snapshot()

    expect(fresh.every(role => role.showInOrganigram === false)).toBe(true)
  })

  it('is idempotent', async () => {
    const { countAfterFirstRun, countAfterSecondRun } = await snapshot()

    expect(countAfterFirstRun).toBe(4)
    expect(countAfterSecondRun).toBe(4)
  })

  it('keeps the name a congregation had already typed on a colliding key', async () => {
    const { collided } = await snapshot()

    // The destructive alternative — nulling it so the localised string wins — throws away
    // something the congregation wrote and cannot be undone.
    expect(collided?.name).toBe('Coordinator')
  })

  it('promotes a colliding custom role to built-in rather than duplicating it', async () => {
    const { collided } = await snapshot()

    expect(collided?.isBuiltIn).toBe(true)
  })

  it('keeps the people already assigned to a colliding role', async () => {
    const { collidedAssignments } = await snapshot()

    expect(collidedAssignments).toBe(1)
  })
})
