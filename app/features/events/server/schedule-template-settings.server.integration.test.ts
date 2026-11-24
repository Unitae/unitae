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
  weekendId: number
  /** A role of another congregation, made before the scope is set. */
  foreignRoleId: number
  /** One of the identity roles, never delegatable. */
  identityRoleId: number
  templateOf: (eventKindId: number, kind: 'programme' | 'duty') => Promise<{ id: number; name: string | null }>
  roleOf: (scheduleTemplateId: number) => Promise<number | null>
}

async function inCongregation(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `st-settings-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const elsewhere = (
          await tx.congregation.create({ data: { name: `${stamp}-x`, slug: `${stamp}-x`, active: true } })
        ).id
        const foreignRoleId = (
          await tx.role.create({ data: { key: `x-${stamp}`, name: 'X', congregationId: elsewhere } })
        ).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const db = tx as unknown as TransactionClient
        const actorId = (
          await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
        ).id
        await seedDefaultTemplates(db, congregationId, 'fr')
        const midweekId = (await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })).id
        const weekendId = (await tx.eventTemplate.findFirstOrThrow({ where: { key: 'weekend-meeting' } })).id
        const identityRoleId = (await tx.role.create({ data: { key: 'publisher', isBuiltIn: true, congregationId } }))
          .id
        const templateOf = async (eventKindId: number, kind: 'programme' | 'duty') =>
          await tx.scheduleTemplate.findFirstOrThrow({
            where: { kind, eventKinds: { some: { eventKindId } } },
            select: { id: true, name: true },
          })
        const roleOf = async (scheduleTemplateId: number) =>
          (await tx.scheduleTemplate.findFirstOrThrow({ where: { id: scheduleTemplateId } })).responsibleRoleId
        const role = async (name: string) =>
          (await tx.role.create({ data: { key: `${name}-${stamp}`, name, congregationId } })).id
        await fn({
          db,
          congregationId,
          actorId,
          role,
          midweekId,
          weekendId,
          foreignRoleId,
          identityRoleId,
          templateOf,
          roleOf,
        })
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
  const auditsOf = (db: TransactionClient, congregationId: number, entityId: number) =>
    db.auditLog.findMany({ where: { congregationId, action: 'schedule_template.updated', entityId } })
  const rowsOf = (db: TransactionClient, templateId: number) =>
    db.templateResponsible.findMany({ where: { templateId }, select: { scope: true, roleId: true } })

  it('saves its name and responsible, audits what is stored, and the kind’s derivation leaves them alone after', async () => {
    await inCongregation(async ({ db, congregationId, actorId, role, midweekId, templateOf, roleOf }) => {
      const programme = await templateOf(midweekId, 'programme')
      const roleId = await role('Coordinateur')

      const saved = await updateScheduleTemplate(
        db,
        programme.id,
        { name: 'Vie et ministère', responsibleRoleId: roleId },
        congregationId,
        actorId,
      )
      expect(saved).toEqual({ ok: true })
      await syncTemplateScheduleTemplates(db, midweekId, congregationId)

      expect(await db.scheduleTemplate.findFirstOrThrow({ where: { id: programme.id } })).toMatchObject({
        name: 'Vie et ministère',
        responsibleRoleId: roleId,
      })
      expect(await roleOf(programme.id)).toBe(roleId)
      const [audited, ...more] = await auditsOf(db, congregationId, programme.id)
      expect(more).toEqual([])
      expect(JSON.parse(audited?.metadata ?? '{}')).toEqual({
        name: { from: programme.name, to: 'Vie et ministère' },
        responsibleRoleId: { from: null, to: roleId },
        eventKindIds: [midweekId],
      })
    })
  })

  it('writes a programme template’s responsible to its kind’s programme scope, which the duties follow while unset', async () => {
    await inCongregation(async ({ db, congregationId, actorId, role, midweekId, templateOf, roleOf }) => {
      const programme = await templateOf(midweekId, 'programme')
      const duties = await templateOf(midweekId, 'duty')
      const roleId = await role('Coordinateur')

      await updateScheduleTemplate(db, programme.id, { responsibleRoleId: roleId }, congregationId, actorId)

      expect(await rowsOf(db, midweekId)).toEqual([{ scope: 'programme', roleId }])
      // The derivation's fallback, unchanged by this page: a duties template without its own takes the programme's.
      expect(await roleOf(duties.id)).toBe(roleId)

      await updateScheduleTemplate(db, programme.id, { responsibleRoleId: null }, congregationId, actorId)
      expect(await rowsOf(db, midweekId)).toEqual([])
      expect(await roleOf(programme.id)).toBeNull()
      expect(await roleOf(duties.id)).toBeNull()
    })
  })

  it('writes a duties template’s responsible to the services scope, leaving the programme template without one', async () => {
    await inCongregation(async ({ db, congregationId, actorId, role, midweekId, templateOf, roleOf }) => {
      const programme = await templateOf(midweekId, 'programme')
      const duties = await templateOf(midweekId, 'duty')
      const roleId = await role('Services')

      expect(
        await updateScheduleTemplate(db, duties.id, { responsibleRoleId: roleId }, congregationId, actorId),
      ).toEqual({ ok: true })
      await syncTemplateScheduleTemplates(db, midweekId, congregationId)

      expect(await rowsOf(db, midweekId)).toEqual([{ scope: 'service', roleId }])
      expect(await roleOf(duties.id)).toBe(roleId)
      expect(await roleOf(programme.id)).toBeNull()

      await updateScheduleTemplate(db, duties.id, { responsibleRoleId: null }, congregationId, actorId)
      expect(await rowsOf(db, midweekId)).toEqual([])
      expect(await roleOf(duties.id)).toBeNull()
    })
  })

  it('renaming a duties template that shows the programme’s responsible leaves it following the programme', async () => {
    await inCongregation(async ({ db, congregationId, actorId, role, midweekId, templateOf, roleOf }) => {
      const programme = await templateOf(midweekId, 'programme')
      const duties = await templateOf(midweekId, 'duty')
      const first = await role('P')
      const second = await role('Q')
      await updateScheduleTemplate(db, programme.id, { responsibleRoleId: first }, congregationId, actorId)

      // The page posts the role it shows back with the new name.
      await updateScheduleTemplate(
        db,
        duties.id,
        { name: 'Accueil et sono', responsibleRoleId: first },
        congregationId,
        actorId,
      )
      expect(await rowsOf(db, midweekId)).toEqual([{ scope: 'programme', roleId: first }])

      await updateScheduleTemplate(db, programme.id, { responsibleRoleId: second }, congregationId, actorId)
      expect(await roleOf(duties.id)).toBe(second)
    })
  })

  it('clearing a duties template while the programme has one: the programme’s is stored, and the audit says so', async () => {
    await inCongregation(async ({ db, congregationId, actorId, role, midweekId, templateOf, roleOf }) => {
      const programme = await templateOf(midweekId, 'programme')
      const duties = await templateOf(midweekId, 'duty')
      const first = await role('P')
      const own = await role('S')
      await updateScheduleTemplate(db, programme.id, { responsibleRoleId: first }, congregationId, actorId)
      await updateScheduleTemplate(db, duties.id, { responsibleRoleId: own }, congregationId, actorId)

      await updateScheduleTemplate(db, duties.id, { responsibleRoleId: null }, congregationId, actorId)

      expect(await roleOf(duties.id)).toBe(first)
      const audits = await auditsOf(db, congregationId, duties.id)
      expect(JSON.parse(audits.at(-1)?.metadata ?? '{}').responsibleRoleId).toEqual({ from: own, to: first })
    })
  })

  it('writes and audits nothing for a save that changes nothing, and leaves alone what is not posted', async () => {
    await inCongregation(async ({ db, congregationId, actorId, role, midweekId, templateOf, roleOf }) => {
      const programme = await templateOf(midweekId, 'programme')
      const roleId = await role('Coordinateur')
      await updateScheduleTemplate(db, programme.id, { responsibleRoleId: roleId }, congregationId, actorId)
      const before = await auditsOf(db, congregationId, programme.id)

      expect(
        await updateScheduleTemplate(
          db,
          programme.id,
          { name: programme.name, responsibleRoleId: roleId },
          congregationId,
          actorId,
        ),
      ).toEqual({ ok: true })
      expect(await updateScheduleTemplate(db, programme.id, {}, congregationId, actorId)).toEqual({ ok: true })

      expect(await auditsOf(db, congregationId, programme.id)).toHaveLength(before.length)
      expect(await db.scheduleTemplate.findFirstOrThrow({ where: { id: programme.id } })).toMatchObject({
        name: programme.name,
      })
      expect(await roleOf(programme.id)).toBe(roleId)
    })
  })

  it('keeps a stored role no one may pick any more when only the name changes', async () => {
    await inCongregation(async ({ db, congregationId, actorId, identityRoleId }) => {
      const loose = await db.scheduleTemplate.create({
        data: { name: 'Ancien', kind: 'programme', responsibleRoleId: identityRoleId, congregationId },
      })

      expect(
        await updateScheduleTemplate(
          db,
          loose.id,
          { name: 'Ancien modèle', responsibleRoleId: identityRoleId },
          congregationId,
          actorId,
        ),
      ).toEqual({ ok: true })
      expect(await db.scheduleTemplate.findFirstOrThrow({ where: { id: loose.id } })).toMatchObject({
        name: 'Ancien modèle',
        responsibleRoleId: identityRoleId,
      })
    })
  })

  it('stores the role on a template no kind suggests, and writes it to every kind suggesting one', async () => {
    await inCongregation(async ({ db, congregationId, actorId, role, midweekId, weekendId, templateOf, roleOf }) => {
      const roleId = await role('Coordinateur')
      const loose = await db.scheduleTemplate.create({ data: { name: 'Libre', kind: 'programme', congregationId } })
      await updateScheduleTemplate(db, loose.id, { responsibleRoleId: roleId }, congregationId, actorId)
      expect(await roleOf(loose.id)).toBe(roleId)

      // Only an archive restore links one template to two kinds today.
      const shared = await templateOf(midweekId, 'programme')
      await db.eventKindScheduleTemplate.create({
        data: { eventKindId: weekendId, scheduleTemplateId: shared.id, order: 9, congregationId },
      })
      await updateScheduleTemplate(db, shared.id, { responsibleRoleId: roleId }, congregationId, actorId)
      expect(await rowsOf(db, midweekId)).toEqual([{ scope: 'programme', roleId }])
      expect(await rowsOf(db, weekendId)).toEqual([{ scope: 'programme', roleId }])
    })
  })

  it('refuses a role of another congregation or an identity role, and an empty name where no key labels it, writing nothing', async () => {
    await inCongregation(
      async ({ db, congregationId, actorId, midweekId, foreignRoleId, identityRoleId, templateOf, roleOf }) => {
        const programme = await templateOf(midweekId, 'programme')

        for (const responsibleRoleId of [foreignRoleId, identityRoleId]) {
          expect(
            await updateScheduleTemplate(db, programme.id, { name: 'X', responsibleRoleId }, congregationId, actorId),
          ).toEqual({ ok: false, reason: 'role' })
        }
        expect(
          await updateScheduleTemplate(
            db,
            programme.id,
            { name: '  ', responsibleRoleId: null },
            congregationId,
            actorId,
          ),
        ).toEqual({ ok: false, reason: 'name' })
        expect(await updateScheduleTemplate(db, 2_000_000_000, { name: 'X' }, congregationId, actorId)).toBeNull()

        expect(await db.scheduleTemplate.findFirstOrThrow({ where: { id: programme.id } })).toMatchObject({
          name: programme.name,
        })
        expect(await roleOf(programme.id)).toBeNull()
        expect(await auditsOf(db, congregationId, programme.id)).toEqual([])
      },
    )
  })
})
