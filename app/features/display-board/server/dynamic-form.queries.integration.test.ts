import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
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

const { listDynamicChoices, loadDynamicForm } = await import('./dynamic-form.queries')

const ts = Date.now()
const now = new Date('2026-11-09T12:00:00Z')
const ids = { cong: 0, other: 0, first: 0, second: 0, groups: 0, otherDoc: 0 }

beforeAll(async () => {
  for (const key of ['cong', 'other'] as const) {
    ids[key] = (
      await testDb.congregation.create({
        data: { name: `Dynamic Form ${key} ${ts}`, slug: `dynamic-form-${key}-${ts}`, active: true },
      })
    ).id
  }
  await withScope(ids.cong, async tx => {
    ids.first = (await tx.boardSection.create({ data: { name: 'Assemblée', order: 0, congregationId: ids.cong } })).id
    ids.second = (
      await tx.boardSection.create({ data: { name: 'Prédication', order: 1, congregationId: ids.cong } })
    ).id
    const groups = await tx.boardDynamicDocumentSettings.create({
      data: {
        title: 'Groupes',
        dynamicType: 'publisher-groups',
        sectionId: ids.second,
        visibleFrom: new Date('2026-10-01T00:00:00Z'),
        isHighlighted: true,
        appearance: { typeface: 'serif', accent: 'wine', layout: 'bands' },
        congregationId: ids.cong,
      },
    })
    ids.groups = groups.id
    await tx.boardDocument.create({
      data: { title: 'Lettre', sectionId: ids.first, isHighlighted: true, congregationId: ids.cong },
    })
  })
  ids.otherDoc = await withScope(ids.other, async tx => {
    const section = await tx.boardSection.create({ data: { name: 'Ailleurs', order: 0, congregationId: ids.other } })
    const doc = await tx.boardDynamicDocumentSettings.create({
      data: { title: 'Pionniers', dynamicType: 'pioneers', sectionId: section.id, congregationId: ids.other },
    })
    return doc.id
  })
})

afterAll(async () => {
  for (const id of [ids.cong, ids.other]) {
    if (!id) continue
    await withScope(id, async tx => {
      await tx.boardDocument.deleteMany({})
      await tx.boardDynamicDocumentSettings.deleteMany({})
      await tx.boardSection.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [ids.cong, ids.other] } } })
  await testDb.$disconnect()
})

const load = (document: Parameters<typeof loadDynamicForm>[1]['document']) =>
  withScope(ids.cong, tx => loadDynamicForm(tx as never, { congregationId: ids.cong, now, document }))

describe('loadDynamicForm', () => {
  it('gives an existing document with its appearance, its data to preview and the others « à la une »', async () => {
    const form = await load({ id: ids.groups })

    expect(form?.document).toMatchObject({
      id: ids.groups,
      type: 'publisher-groups',
      title: 'Groupes',
      sectionId: ids.second,
      isHighlighted: true,
    })
    expect(form?.appearance).toEqual({ typeface: 'serif', accent: 'wine', layout: 'bands' })
    expect(form?.sections.map(s => s.name)).toEqual(['Assemblée', 'Prédication'])
    expect(form?.highlightedOthers).toBe(1)
    expect(form?.data?.type).toBe('publisher-groups')
  })

  it('starts a new document of a type in the first section, shown from now, in its default appearance', async () => {
    const form = await load({ type: 'publisher-groups', ref: null, title: 'Groupes de prédication' })

    expect(form?.document).toMatchObject({
      id: null,
      title: 'Groupes de prédication',
      sectionId: ids.first,
      visibleFrom: now,
      isHighlighted: false,
    })
    expect(form?.appearance.layout).toBe('directory')
    expect(form?.highlightedOthers).toBe(2)
  })

  it("finds nothing of another congregation's document", async () => {
    expect(await load({ id: ids.otherDoc })).toBeNull()
  })
})

describe('listDynamicChoices', () => {
  it('lists the types this congregation can show, each already added one with the document to open', async () => {
    const choices = await withScope(ids.cong, tx => listDynamicChoices(tx as never, ids.cong))

    expect(choices.hasSection).toBe(true)
    expect(choices.existing).toEqual({ 'publisher-groups|': ids.groups })
  })
})
