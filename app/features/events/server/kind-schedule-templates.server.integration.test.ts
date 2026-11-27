import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// The schedule templates a meeting type uses, chosen on its page (6b-2): one of each sort at most, as a new meeting
// copies the first of each; a template used stops being used without losing its items or giving the type a new one; the
// order is written as chosen. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { addKindScheduleTemplate, removeKindScheduleTemplate, orderKindScheduleTemplates } = await import(
  './kind-schedule-templates.server'
)
const { kindTemplate, TEMPLATE_INCLUDE } = await import('./give-programme.server')
const { syncTemplateScheduleTemplates } = await import('./schedule-templates.server')
const { deleteTemplate } = await import('./delete-template.server')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

interface Fixture {
  tx: Parameters<Parameters<typeof testDb.$transaction>[0]>[0]
  db: TransactionClient
  congregationId: number
  actorId: number
  kindId: number
  /** The type's own programme template, holding one part of the type's. */
  own: number
  /** A programme and a duties template no kind uses, each with an item of its own. */
  loose: { programme: number; duty: number }
}

async function inCongregation<T>(fn: (fixture: Fixture) => Promise<T>): Promise<T> {
  let out: T | undefined
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `kind-st-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const db = tx as unknown as TransactionClient
        const actorId = (
          await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
        ).id
        const kindId = (await tx.eventTemplate.create({ data: { name: 'Visite', key: stamp, congregationId } })).id
        const template = async (name: string, kind: 'programme' | 'duty') =>
          (await tx.scheduleTemplate.create({ data: { name, kind, congregationId } })).id
        const own = await template('Visite', 'programme')
        await tx.eventKindScheduleTemplate.create({
          data: { eventKindId: kindId, scheduleTemplateId: own, order: 0, congregationId },
        })
        const part = { section: '', track: '', order: 0, congregationId }
        await tx.templatePart.create({
          data: { ...part, name: 'Du type', templateId: kindId, scheduleTemplateId: own },
        })
        const loose = { programme: await template('Libre', 'programme'), duty: await template('Accueil', 'duty') }
        await tx.templatePart.create({ data: { ...part, name: 'Du libre', scheduleTemplateId: loose.programme } })
        await tx.templateServicePart.create({
          data: { name: 'Porte', key: 'porte', order: 0, scheduleTemplateId: loose.duty, congregationId },
        })
        out = await fn({ tx, db, congregationId, actorId, kindId, own, loose })
        throw new Rollback()
      },
      { timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return out as T
}

/** What a new meeting of the type gets, by name. */
async function copied(fixture: Fixture) {
  const loaded = await fixture.tx.eventTemplate.findFirstOrThrow({
    where: { id: fixture.kindId },
    include: TEMPLATE_INCLUDE,
  })
  const items = kindTemplate(loaded)
  return { parts: items.parts.map(each => each.name), services: items.serviceParts.map(each => each.name) }
}

const links = (fixture: Fixture) =>
  fixture.tx.eventKindScheduleTemplate.findMany({
    where: { eventKindId: fixture.kindId },
    orderBy: { order: 'asc' },
    select: { scheduleTemplateId: true },
  })

describe('addKindScheduleTemplate', () => {
  it('lets a type use a duties template, whose items its new meetings then get, and audits it', async () => {
    const read = await inCongregation(async fixture => {
      const { db, kindId, loose, congregationId, actorId } = fixture
      const result = await addKindScheduleTemplate(db, kindId, loose.duty, congregationId, actorId)
      await syncTemplateScheduleTemplates(db, kindId, congregationId)
      return {
        result,
        links: (await links(fixture)).map(each => each.scheduleTemplateId),
        copied: await copied(fixture),
        expected: [fixture.own, loose.duty],
      }
    })
    expect(read.result).toEqual({ ok: true })
    expect(read.links).toEqual(read.expected)
    expect(read.copied).toEqual({ parts: ['Du type'], services: ['Porte'] })
  })

  it('refuses a second programme template, and one the type uses already', async () => {
    const read = await inCongregation(async ({ db, kindId, own, loose, congregationId, actorId }) => ({
      second: await addKindScheduleTemplate(db, kindId, loose.programme, congregationId, actorId),
      again: await addKindScheduleTemplate(db, kindId, own, congregationId, actorId),
    }))
    // A second programme is refused (a meeting holds one); the one it uses, as used.
    expect(read).toEqual({ second: { ok: false, reason: 'sort-used' }, again: { ok: false, reason: 'used' } })
  })

  // Several duties templates (user, 2026-11-27): one schedule each on its meetings; a template once, a programme once.
  it('lets a type use a second duties template, never the same one twice', async () => {
    const read = await inCongregation(async ({ tx, db, kindId, loose, congregationId, actorId }) => {
      const visio = (await tx.scheduleTemplate.create({ data: { name: 'Visio', kind: 'duty', congregationId } })).id
      return {
        first: await addKindScheduleTemplate(db, kindId, loose.duty, congregationId, actorId),
        second: await addKindScheduleTemplate(db, kindId, visio, congregationId, actorId),
        again: await addKindScheduleTemplate(db, kindId, visio, congregationId, actorId),
      }
    })
    expect(read).toEqual({ first: { ok: true }, second: { ok: true }, again: { ok: false, reason: 'used' } })
  })

  // A schedule without a name reads as its template's (user, 2026-11-27): two unnamed ones on a meeting read alike.
  it('refuses a second unnamed duties template, and takes a named one beside an unnamed', async () => {
    const read = await inCongregation(async ({ tx, db, kindId, congregationId, actorId }) => {
      const unnamed = async () =>
        (await tx.scheduleTemplate.create({ data: { name: null, key: 'services', kind: 'duty', congregationId } })).id
      const [first, second] = [await unnamed(), await unnamed()]
      const named = (await tx.scheduleTemplate.create({ data: { name: 'Nettoyage', kind: 'duty', congregationId } })).id
      return {
        first: await addKindScheduleTemplate(db, kindId, first, congregationId, actorId),
        second: await addKindScheduleTemplate(db, kindId, second, congregationId, actorId),
        named: await addKindScheduleTemplate(db, kindId, named, congregationId, actorId),
      }
    })
    expect(read).toEqual({ first: { ok: true }, second: { ok: false, reason: 'unnamed' }, named: { ok: true } })
  })

  it('answers null for a type or a template of another congregation, or none at all', async () => {
    const read = await inCongregation(async ({ db, kindId, loose, congregationId, actorId }) => ({
      kind: await addKindScheduleTemplate(db, -1, loose.duty, congregationId, actorId),
      template: await addKindScheduleTemplate(db, kindId, -1, congregationId, actorId),
    }))
    expect(read).toEqual({ kind: null, template: null })
  })
})

describe('removeKindScheduleTemplate', () => {
  it('keeps the template’s items as its own, gives the type no new template, and leaves it when the type goes', async () => {
    const read = await inCongregation(async fixture => {
      const { tx, db, kindId, own, congregationId, actorId } = fixture
      const result = await removeKindScheduleTemplate(db, kindId, own, congregationId, actorId)
      await syncTemplateScheduleTemplates(db, kindId, congregationId)
      const afterSync = {
        links: await links(fixture),
        templates: await tx.scheduleTemplate.count({ where: { congregationId } }),
        copied: await copied(fixture),
      }
      await deleteTemplate(db, kindId, congregationId, actorId)
      const parts = await tx.templatePart.findMany({
        where: { scheduleTemplateId: own },
        select: { name: true, templateId: true },
      })
      return { result, afterSync, parts }
    })
    expect(read.result).toEqual({ ok: true })
    expect(read.afterSync).toEqual({ links: [], templates: 3, copied: { parts: [], services: [] } })
    expect(read.parts).toEqual([{ name: 'Du type', templateId: null }])
  })

  it('answers null for a template the type does not use', async () => {
    const read = await inCongregation(({ db, kindId, loose, congregationId, actorId }) =>
      removeKindScheduleTemplate(db, kindId, loose.duty, congregationId, actorId),
    )
    expect(read).toBeNull()
  })
})

describe('orderKindScheduleTemplates', () => {
  it('writes the order chosen, and refuses a list that is not the type’s templates', async () => {
    const read = await inCongregation(async fixture => {
      const { db, kindId, own, loose, congregationId, actorId } = fixture
      await addKindScheduleTemplate(db, kindId, loose.duty, congregationId, actorId)
      const wrong = await orderKindScheduleTemplates(db, kindId, [loose.duty], congregationId, actorId)
      const result = await orderKindScheduleTemplates(db, kindId, [loose.duty, own], congregationId, actorId)
      return {
        wrong,
        result,
        links: (await links(fixture)).map(each => each.scheduleTemplateId),
        expected: [loose.duty, own],
      }
    })
    expect(read.wrong).toBeNull()
    expect(read.result).toEqual({ ok: true })
    expect(read.links).toEqual(read.expected)
  })
})
