import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// A programme document's configuration names the templates it shows. What the board reads for it — its events, the
// preview of the next one, the version that tells a reader it changed — follows those templates and the published
// events only, and a new document ticks every template.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const { getContentVersion, getDynamicDocumentData, getDynamicPreview } = await import('./dynamic-documents.server')
const { loadDynamicForm } = await import('./dynamic-form.queries')

const ts = Date.now()
const ids = { cong: 0, account: 0, midweek: 0, weekend: 0, draftOnly: 0 }
// Ahead of today, so every reader — the screen from this month on, the preview from now on — would see them.
const day = (days: number) => new Date(Date.now() + days * 86_400_000)

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({
      data: { name: `Programme ${ts}`, slug: `programme-config-${ts}`, active: true },
    })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    ids.account = (
      await tx.userAccount.create({ data: { email: `programme-${ts}@test.com`, password: 'x', congregationId } })
    ).id
    const template = async (name: string, key: string) =>
      (await tx.eventTemplate.create({ data: { name, key, congregationId } })).id
    ids.midweek = await template('Réunion de semaine', 'midweek-meeting')
    ids.weekend = await template('Réunion du week-end', 'weekend-meeting')
    ids.draftOnly = await template('Assemblée', `assembly-${ts}`)
    const event = (name: string, templateId: number, when: Date, status: string) =>
      tx.event.create({
        data: { name, startDate: when, endDate: when, status, templateId, createdById: ids.account, congregationId },
      })
    await event('Réunion de semaine', ids.midweek, day(10), 'released')
    // A draft sooner than the published one: no reader shows it yet.
    await event('Réunion de semaine (brouillon)', ids.midweek, day(1), 'draft')
    await event('Réunion du week-end', ids.weekend, day(3), 'released')
    await event('Assemblée', ids.draftOnly, day(5), 'draft')
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

const only = (templateId: number) => ({ templates: [{ templateId, parts: true, services: true }], groupBy: 'date' })

describe('a programme document and its templates', () => {
  it('offers every template in the form of a new document, and ticks them all', async () => {
    const form = await withScope(ids.cong, tx =>
      loadDynamicForm(tx, {
        congregationId: ids.cong,
        now: new Date(),
        document: { type: 'programme', ref: null, title: 'Programme' },
      }),
    )

    const offered = (form?.templates ?? []).map(template => template.id)
    expect(offered).toEqual(expect.arrayContaining([ids.midweek, ids.weekend, ids.draftOnly]))
    const config = form?.document.dynamicConfig as { templates: { templateId: number; parts: boolean }[] } | undefined
    const ticked = config?.templates ?? []
    expect(ticked).not.toHaveLength(0)
    expect(ticked.map(entry => entry.templateId).sort()).toEqual([...offered].sort())
    expect(ticked.every(entry => entry.parts)).toBe(true)
  })

  it('shows the published events of its templates only', async () => {
    const data = await withScope(ids.cong, tx =>
      getDynamicDocumentData(tx, 'programme', null, ids.cong, { showServices: true, dynamicConfig: only(ids.midweek) }),
    )

    const events = data && 'events' in data ? (data.events ?? []) : []
    expect(events.map(event => event.name)).toEqual(['Réunion de semaine'])
  })

  it('previews the next published event of its templates, never a draft', async () => {
    const preview = (templateId: number) =>
      withScope(ids.cong, tx => getDynamicPreview(tx, 'programme', null, ids.cong, only(templateId)))
    const midweek = await preview(ids.midweek)
    const weekend = await preview(ids.weekend)

    expect(midweek).not.toBeNull()
    expect(weekend).not.toBeNull()
    // The midweek preview is its published meeting in ten days, not the draft tomorrow nor the weekend's in three.
    expect(midweek).not.toBe(weekend)
    expect(await preview(ids.draftOnly)).toBeNull()
  })

  it('changes version with its templates’ events, not with another template’s', async () => {
    const version = (templateId: number) =>
      withScope(ids.cong, tx => getContentVersion(tx, 'programme', null, ids.cong, only(templateId)))
    const before = await version(ids.midweek)
    expect(before).toBeInstanceOf(Date)

    await new Promise(resolve => setTimeout(resolve, 20))
    await withScope(ids.cong, tx =>
      tx.event.updateMany({ where: { templateId: ids.weekend }, data: { name: 'Réunion du week-end (modifiée)' } }),
    )
    expect(await version(ids.midweek)).toEqual(before)

    await withScope(ids.cong, tx =>
      tx.event.updateMany({
        where: { templateId: ids.midweek, status: 'released' },
        data: { name: 'Réunion de semaine (modifiée)' },
      }),
    )
    expect((await version(ids.midweek))?.getTime()).toBeGreaterThan(before?.getTime() ?? 0)
  })
})
