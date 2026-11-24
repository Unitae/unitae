import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// Réglages › « Modèles de planning » (6a, plan §11): each schedule template's name and responsible are edited on the
// template itself, and the kind's derivation no longer overwrites them. Against the database, in a congregation of
// its own, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { listScheduleTemplatesForSettings } = await import('./schedule-template-settings.queries')
const { updateScheduleTemplate } = await import('./schedule-template-settings.server')

class Rollback extends Error {}

interface Fixture {
  db: TransactionClient
  congregationId: number
  actorId: number
  role: (name: string) => Promise<number>
  midweekId: number
}

async function inCongregation(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `st-settings-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const db = tx as unknown as TransactionClient
        const actorId = (
          await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
        ).id
        await seedDefaultTemplates(db, congregationId, 'fr')
        const midweekId = (await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })).id
        const role = async (name: string) =>
          (await tx.role.create({ data: { key: `${name}-${stamp}`, name, congregationId } })).id
        await fn({ db, congregationId, actorId, role, midweekId })
        throw new Rollback()
      },
      { timeout: 20_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('listScheduleTemplatesForSettings', () => {
  it('lists each schedule template with its kind, items, responsible and the kinds suggesting it', async () => {
    await inCongregation(async ({ db, congregationId, midweekId }) => {
      const templates = await listScheduleTemplatesForSettings(db, congregationId)
      const midweekProgramme = templates.find(
        template => template.kind === 'programme' && template.kinds.some(kind => kind.id === midweekId),
      )

      expect(midweekProgramme).toMatchObject({ kind: 'programme', responsibleRole: null, schedules: 0 })
      expect(midweekProgramme?.items).toBeGreaterThan(0)
      // Every seeded template is suggested by one kind (D25).
      expect(templates.every(template => template.kinds.length === 1)).toBe(true)
    })
  })
})

describe('updateScheduleTemplate', () => {
  it('saves its name and responsible, audits it, and the kind’s derivation leaves them alone after', async () => {
    await inCongregation(async ({ db, congregationId, actorId, role, midweekId }) => {
      const [template] = (await listScheduleTemplatesForSettings(db, congregationId)).filter(each =>
        each.kinds.some(kind => kind.id === midweekId),
      )
      if (template == null) throw new Error('expected a template')
      const roleId = await role('Coordinateur')

      const saved = await updateScheduleTemplate(
        db,
        template.id,
        { name: 'Vie et ministère', responsibleRoleId: roleId },
        congregationId,
        actorId,
      )
      expect(saved).toEqual({ ok: true })
      await syncTemplateScheduleTemplates(db, midweekId, congregationId)

      const row = await db.scheduleTemplate.findFirstOrThrow({ where: { id: template.id } })
      expect(row).toMatchObject({ name: 'Vie et ministère', responsibleRoleId: roleId })
      const audited = await db.auditLog.findFirst({
        where: { congregationId, action: 'schedule_template.updated', entityId: template.id },
      })
      expect(audited).not.toBeNull()
    })
  })

  it('sets then clears a duties template’s responsible, and the kind’s derivation follows both', async () => {
    await inCongregation(async ({ db, congregationId, actorId, role, midweekId }) => {
      const duties = (await listScheduleTemplatesForSettings(db, congregationId)).find(
        each => each.kind === 'duty' && each.kinds.some(kind => kind.id === midweekId),
      )
      if (duties == null) throw new Error('expected the midweek duties')
      const roleId = await role('Services')
      const keep = { name: duties.name, responsibleRoleId: roleId }

      expect(await updateScheduleTemplate(db, duties.id, keep, congregationId, actorId)).toEqual({ ok: true })
      await syncTemplateScheduleTemplates(db, midweekId, congregationId)
      expect((await db.scheduleTemplate.findFirstOrThrow({ where: { id: duties.id } })).responsibleRoleId).toBe(roleId)

      const cleared = { name: duties.name, responsibleRoleId: null }
      expect(await updateScheduleTemplate(db, duties.id, cleared, congregationId, actorId)).toEqual({ ok: true })
      await syncTemplateScheduleTemplates(db, midweekId, congregationId)
      expect((await db.scheduleTemplate.findFirstOrThrow({ where: { id: duties.id } })).responsibleRoleId).toBeNull()
      expect(await db.templateResponsible.count({ where: { templateId: midweekId } })).toBe(0)
    })
  })

  it('refuses a role of another congregation, an empty name where no key labels it, and a template not there', async () => {
    await inCongregation(async ({ db, congregationId, actorId, midweekId }) => {
      const templates = await listScheduleTemplatesForSettings(db, congregationId)
      const named = templates.find(each => each.key == null && each.kinds.some(kind => kind.id === midweekId))
      if (named == null) throw new Error('expected a named template')
      const foreign = await testDb.role.findFirst({ where: { congregationId: { not: congregationId } } })

      if (foreign != null) {
        expect(
          await updateScheduleTemplate(
            db,
            named.id,
            { name: 'X', responsibleRoleId: foreign.id },
            congregationId,
            actorId,
          ),
        ).toEqual({ ok: false, reason: 'role' })
      }
      expect(
        await updateScheduleTemplate(db, named.id, { name: '  ', responsibleRoleId: null }, congregationId, actorId),
      ).toEqual({ ok: false, reason: 'name' })
      expect(
        await updateScheduleTemplate(
          db,
          2_000_000_000,
          { name: 'X', responsibleRoleId: null },
          congregationId,
          actorId,
        ),
      ).toBeNull()
    })
  })
})
