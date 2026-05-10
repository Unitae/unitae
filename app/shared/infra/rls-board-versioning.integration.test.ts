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

const ts = Date.now()
let congregationIdA: number
let congregationIdB: number
let versionIdA: number
let versionIdB: number
let dynamicSettingsIdA: number
let dynamicSettingsIdB: number

async function seedCongregation(name: string, slug: string) {
  const cong = await testDb.congregation.create({ data: { name, slug, active: true } })

  return withScope(cong.id, async tx => {
    const section = await tx.boardSection.create({
      data: { name: `Section ${name}`, order: 0, congregationId: cong.id },
    })
    const document = await tx.boardDocument.create({
      data: { title: `Doc ${name}`, type: 'pdf', sectionId: section.id, order: 0, congregationId: cong.id },
    })
    const version = await tx.boardDocumentVersion.create({
      data: { documentId: document.id, uri: `storage/${slug}.pdf`, versionNumber: 1, congregationId: cong.id },
    })
    const dynamic = await tx.boardDynamicDocumentSettings.create({
      data: {
        title: `Dyn ${name}`,
        dynamicType: 'publisher-groups',
        dynamicRef: null,
        sectionId: section.id,
        congregationId: cong.id,
      },
    })
    return { congregationId: cong.id, versionId: version.id, dynamicSettingsId: dynamic.id }
  })
}

beforeAll(async () => {
  const a = await seedCongregation(`RLS Board A ${ts}`, `rls-board-a-${ts}`)
  const b = await seedCongregation(`RLS Board B ${ts}`, `rls-board-b-${ts}`)
  congregationIdA = a.congregationId
  congregationIdB = b.congregationId
  versionIdA = a.versionId
  versionIdB = b.versionId
  dynamicSettingsIdA = a.dynamicSettingsId
  dynamicSettingsIdB = b.dynamicSettingsId
})

afterAll(async () => {
  for (const congId of [congregationIdA, congregationIdB]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.boardDynamicDocumentSettings.deleteMany({})
      await tx.boardDocumentVersion.deleteMany({})
      await tx.boardDocument.deleteMany({})
      await tx.boardSection.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [congregationIdA, congregationIdB] } } })
  await testDb.$disconnect()
})

describe('RLS isolation for BoardDocumentVersion', () => {
  it('ne retourne que les versions de la congrégation A quand le scope est A', async () => {
    const versions = await withScope(congregationIdA, tx => tx.boardDocumentVersion.findMany())

    expect(versions.map(v => v.id)).toEqual([versionIdA])
    expect(versions.every(v => v.congregationId === congregationIdA)).toBe(true)
  })

  it('empêche la congrégation A de voir les versions de la congrégation B', async () => {
    const versions = await withScope(congregationIdA, tx =>
      tx.boardDocumentVersion.findMany({ where: { id: versionIdB } }),
    )

    expect(versions).toHaveLength(0)
  })
})

describe('RLS isolation for BoardDynamicDocumentSettings', () => {
  it('ne retourne que les paramètres dynamiques de la congrégation A quand le scope est A', async () => {
    const settings = await withScope(congregationIdA, tx => tx.boardDynamicDocumentSettings.findMany())

    expect(settings.map(s => s.id)).toEqual([dynamicSettingsIdA])
    expect(settings.every(s => s.congregationId === congregationIdA)).toBe(true)
  })

  it('empêche la congrégation A de voir les paramètres dynamiques de la congrégation B', async () => {
    const settings = await withScope(congregationIdA, tx =>
      tx.boardDynamicDocumentSettings.findMany({ where: { id: dynamicSettingsIdB } }),
    )

    expect(settings).toHaveLength(0)
  })
})
