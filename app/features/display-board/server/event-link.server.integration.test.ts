import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EventStatus } from '~/features/events'

// Integration coverage for resolveProgrammeLink against a real Postgres
// instance. The unit tests mock Prisma; this test verifies the JSON
// serialization/deserialization round-trip of `BoardDynamicDocumentSettings.dynamicConfig`
// and the `SELECT ... WHERE congregationId = ...` behavior under RLS.

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

const { resolveProgrammeLink } = await import('./event-link.server')

const ts = Date.now()
let congId: number
let creatorId: number
let sectionId: number
let templateAId: number
let templateBId: number
let eventAId: number
let eventBId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Prog Link ${ts}`, slug: `prog-link-${ts}`, active: true },
  })
  congId = cong.id

  await withScope(congId, async tx => {
    // Bare user to satisfy Event.createdById FK.
    const creator = await tx.userAccount.create({
      data: {
        email: `prog-link-creator-${ts}@test.com`,
        password: 'hashed',
        active: true,
        congregationId: congId,
      },
    })
    creatorId = creator.id

    const section = await tx.boardSection.create({
      data: { name: 'Programmes', order: 0, congregationId: congId },
    })
    sectionId = section.id

    const templateA = await tx.eventTemplate.create({
      data: { name: 'Weekly meeting', key: `weekly-meeting-${ts}`, congregationId: congId },
    })
    templateAId = templateA.id
    const templateB = await tx.eventTemplate.create({
      data: { name: 'Public talk', key: `public-talk-${ts}`, congregationId: congId },
    })
    templateBId = templateB.id

    // Released and dated inside the window a programme document renders —
    // fixed dates would silently start resolving to /board once the month they
    // fall in has passed.
    const soon = new Date(new Date().getFullYear(), new Date().getMonth(), 28, 18, 30)
    const alsoSoon = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 4, 15, 0)

    const eventA = await tx.event.create({
      data: {
        name: 'Meeting A',
        startDate: soon,
        endDate: new Date(soon.getTime() + 90 * 60 * 1000),
        status: EventStatus.Released,
        templateId: templateAId,
        createdById: creatorId,
        congregationId: congId,
      },
    })
    eventAId = eventA.id
    const eventB = await tx.event.create({
      data: {
        name: 'Talk B',
        startDate: alsoSoon,
        endDate: new Date(alsoSoon.getTime() + 60 * 60 * 1000),
        status: EventStatus.Released,
        templateId: templateBId,
        createdById: creatorId,
        congregationId: congId,
      },
    })
    eventBId = eventB.id
  })
})

afterAll(async () => {
  if (congId) {
    await withScope(congId, async tx => {
      await tx.boardDynamicDocumentSettings.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.boardSection.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: congId } })
  }
  await testDb.$disconnect()
})

describe('resolveProgrammeLink (integration)', () => {
  it('returns /board when no programme dynamic document is configured', async () => {
    await withScope(congId, async tx => {
      const url = await resolveProgrammeLink(tx, { id: eventAId, templateId: templateAId }, congId)
      expect(url).toBe('/board')
    })
  })

  it('resolves to the dynamic viewer when the config JSON stored in Postgres targets the event template', async () => {
    const settingsId = await withScope(congId, async tx => {
      const row = await tx.boardDynamicDocumentSettings.create({
        data: {
          title: 'Weekly programme',
          dynamicType: 'programme',
          dynamicConfig: {
            templates: [{ templateId: templateAId, parts: true, services: false }],
            groupBy: 'date',
          },
          sectionId,
          congregationId: congId,
        },
      })
      return row.id
    })

    await withScope(congId, async tx => {
      const url = await resolveProgrammeLink(tx, { id: eventAId, templateId: templateAId }, congId)
      expect(url).toBe(`/board/dynamic/${settingsId}/viewer?eventId=${eventAId}`)
    })
  })

  it('falls back to /board when the event template does not appear in any dynamic config', async () => {
    // The row from the previous test targets templateA. eventB has templateB.
    await withScope(congId, async tx => {
      const url = await resolveProgrammeLink(tx, { id: eventBId, templateId: templateBId }, congId)
      expect(url).toBe('/board')
    })
  })

  it('resolves via the legacy dynamicRef field when it matches the template key', async () => {
    const legacyId = await withScope(congId, async tx => {
      // Clear previous rows so only the legacy candidate matches this test.
      await tx.boardDynamicDocumentSettings.deleteMany({})
      const row = await tx.boardDynamicDocumentSettings.create({
        data: {
          title: 'Legacy talk viewer',
          dynamicType: 'programme',
          dynamicRef: `public-talk-${ts}`, // matches templateB.key
          sectionId,
          congregationId: congId,
        },
      })
      return row.id
    })

    await withScope(congId, async tx => {
      const url = await resolveProgrammeLink(tx, { id: eventBId, templateId: templateBId }, congId)
      expect(url).toBe(`/board/dynamic/${legacyId}/viewer?eventId=${eventBId}`)
    })
  })
})
