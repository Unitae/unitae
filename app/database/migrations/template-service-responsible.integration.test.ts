import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const adapter = new PrismaPg({
  connectionString: process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

// Pure DDL, so — like the other structural migration tests — it is asserted against the applied
// database rather than re-executed here: CI runs `prisma migrate deploy` before the suite, and
// re-applying would hold an ACCESS EXCLUSIVE lock that stalls every parallel suite.

/** Thrown to unwind the fixtures; every assertion runs on values captured before it. */
class Rollback extends Error {}

type Fixture = { congregationId: number; templateId: number; roleIds: number[] }

async function withFixture<T>(stampPrefix: string, fn: (tx: never, f: Fixture) => Promise<T>): Promise<T> {
  let result: T | undefined
  try {
    await testDb.$transaction(async tx => {
      const stamp = `${stampPrefix}-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
      const template = await tx.eventTemplate.create({
        data: { name: stamp, key: `${stamp}-tpl`, congregationId: congregation.id },
      })
      const roles = await Promise.all(
        ['a', 'b'].map(suffix =>
          tx.role.create({ data: { key: `${stamp}-${suffix}`, isBuiltIn: false, congregationId: congregation.id } }),
        ),
      )

      result = await fn(tx as never, {
        congregationId: congregation.id,
        templateId: template.id,
        roleIds: roles.map(r => r.id),
      })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return result as T
}

describe('20260901120000_template_service_responsible', () => {
  // The whole reason the unique index moved: before it, a template could name
  // one role, full stop.
  it('lets one template name a role per scope', async () => {
    const scopes = await withFixture('respscope', async (tx: never, f) => {
      const db = tx as unknown as PrismaClient
      await db.templateResponsible.create({
        data: { templateId: f.templateId, roleId: f.roleIds[0], scope: 'programme', congregationId: f.congregationId },
      })
      await db.templateResponsible.create({
        data: { templateId: f.templateId, roleId: f.roleIds[1], scope: 'service', congregationId: f.congregationId },
      })
      const rows = await db.templateResponsible.findMany({ where: { templateId: f.templateId } })
      return rows.map(r => r.scope).sort()
    })

    expect(scopes).toEqual(['programme', 'service'])
  })

  it('still refuses two roles in the same scope', async () => {
    const captured = await withFixture('respdup', async (tx: never, f) => {
      const db = tx as unknown as PrismaClient
      await db.templateResponsible.create({
        data: { templateId: f.templateId, roleId: f.roleIds[0], scope: 'service', congregationId: f.congregationId },
      })
      try {
        await db.templateResponsible.create({
          data: { templateId: f.templateId, roleId: f.roleIds[1], scope: 'service', congregationId: f.congregationId },
        })
      } catch (error) {
        return { message: (error as Error).message }
      }
      return undefined
    })

    expect(captured, 'a second role slipped into the same scope').toBeDefined()
  })

  // An unrecognised scope matches no `scopesCovering` set, so it would delegate
  // to nobody while looking assigned on the settings page. It fails at the write.
  it('rejects a scope outside the catalogue', async () => {
    const captured = await withFixture('respchk', async (tx: never, f) => {
      const db = tx as unknown as PrismaClient
      try {
        await db.$executeRawUnsafe(
          `INSERT INTO "TemplateResponsible" ("templateId", "roleId", "scope", "congregationId")
           VALUES (${f.templateId}, ${f.roleIds[0]}, 'territories', ${f.congregationId})`,
        )
      } catch (error) {
        return { message: (error as Error).message }
      }
      return undefined
    })

    expect(captured, 'an arbitrary scope was accepted').toBeDefined()
    expect(captured?.message).toContain('TemplateResponsible_scope_check')
  })

  // Rows written before the migration were the whole-event delegation, and the
  // column default is what says so for every row the app writes without one.
  it('defaults an unspecified scope to the whole-event delegation', async () => {
    const scope = await withFixture('respdef', async (tx: never, f) => {
      const db = tx as unknown as PrismaClient
      await db.$executeRawUnsafe(
        `INSERT INTO "TemplateResponsible" ("templateId", "roleId", "congregationId")
         VALUES (${f.templateId}, ${f.roleIds[0]}, ${f.congregationId})`,
      )
      const row = await db.templateResponsible.findFirst({ where: { templateId: f.templateId } })
      return row?.scope
    })

    expect(scope).toBe('programme')
  })
})

afterAll(async () => {
  await testDb.$disconnect()
})
