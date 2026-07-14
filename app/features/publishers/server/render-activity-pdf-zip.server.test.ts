import JsZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { findMany: vi.fn() },
  },
}))

const toBuffer = vi.fn().mockResolvedValue(Buffer.from('fake-pdf'))
vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn(() => ({ toBuffer })),
  Document: vi.fn(({ children }: { children: unknown }) => children),
  Page: vi.fn(({ children }: { children: unknown }) => children),
  View: vi.fn(({ children }: { children: unknown }) => children),
  Text: vi.fn(({ children }: { children: unknown }) => children),
  StyleSheet: { create: vi.fn((s: unknown) => s) },
  Font: { register: vi.fn() },
}))

vi.mock('~/shared/auth/sanitize-account.server', () => ({
  sanitizeAccount: vi.fn((u: unknown) => u),
}))

vi.mock('~/features/publishers/ui/PublisherActivityDocument', () => ({
  PublisherActivityDocument: vi.fn(() => null),
}))

const { buildActivityPdfZip, getPublishersWithYearActivities } = await import('./render-activity-pdf-zip.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  toBuffer.mockResolvedValue(Buffer.from('fake-pdf'))
  vi.mocked(db.member.findMany).mockResolvedValue([] as never)
})

describe('getPublishersWithYearActivities', () => {
  it('filters activities from September to August (months 8-11 then 0-7)', async () => {
    await getPublishersWithYearActivities(db, 1, 2025)

    const call = vi.mocked(db.member.findMany).mock.calls[0][0] as Record<string, unknown>
    const where = (call.where as { activities: { some: Record<string, unknown> } }).activities.some
    const include = (call.include as { activities: { where: Record<string, unknown> } }).activities.where

    const whereOr = where.OR as { year: number; month: { gte?: number; lte?: number } }[]
    expect(whereOr[0]).toEqual({ year: 2025, month: { gte: 8 } })
    expect(whereOr[1]).toEqual({ year: 2026, month: { lte: 7 } })

    const includeOr = include.OR as { year: number; month: { gte?: number; lte?: number } }[]
    expect(includeOr[0]).toEqual({ year: 2025, month: { gte: 8 } })
    expect(includeOr[1]).toEqual({ year: 2026, month: { lte: 7 } })
  })

  it('does not touch the PDF engine — it is purely a DB read', async () => {
    const { pdf } = await import('@react-pdf/renderer')
    vi.mocked(db.member.findMany).mockResolvedValue([{ id: 1, firstname: 'Jean', lastname: 'Dupont' }] as never)

    await getPublishersWithYearActivities(db, 1, 2025)

    expect(pdf).not.toHaveBeenCalled()
  })

  it('adds a publisherGroupId constraint when groupId is provided', async () => {
    await getPublishersWithYearActivities(db, 1, 2025, { groupId: 42 })

    const call = vi.mocked(db.member.findMany).mock.calls[0][0] as Record<string, unknown>
    expect(call.where).toMatchObject({ publisherGroupId: 42 })
  })

  it('adds an id: { in: [...] } constraint when publisherIds is provided', async () => {
    await getPublishersWithYearActivities(db, 1, 2025, { publisherIds: [7, 11, 13] })

    const call = vi.mocked(db.member.findMany).mock.calls[0][0] as Record<string, unknown>
    expect(call.where).toMatchObject({ id: { in: [7, 11, 13] } })
  })

  it('composes groupId and publisherIds when both are provided', async () => {
    await getPublishersWithYearActivities(db, 1, 2025, { groupId: 42, publisherIds: [7] })

    const call = vi.mocked(db.member.findMany).mock.calls[0][0] as Record<string, unknown>
    expect(call.where).toMatchObject({ publisherGroupId: 42, id: { in: [7] } })
  })

  it('leaves the where clause unfiltered when neither scope option is provided', async () => {
    await getPublishersWithYearActivities(db, 1, 2025)

    const call = vi.mocked(db.member.findMany).mock.calls[0][0] as Record<string, unknown>
    const where = call.where as Record<string, unknown>
    expect(where).not.toHaveProperty('publisherGroupId')
    expect(where).not.toHaveProperty('id')
  })
})

describe('buildActivityPdfZip', () => {
  it('produces a ZIP archive with one PDF per publisher', async () => {
    const publishers = [
      { id: 1, firstname: 'Alice', lastname: 'Martin', activities: [] },
      { id: 2, firstname: 'Bob', lastname: 'Durand', activities: [] },
    ]

    const buffer = await buildActivityPdfZip(publishers as never)

    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(toBuffer).toHaveBeenCalledTimes(2)
  })

  it('writes one entry per publisher named "{firstname}-{lastname}.pdf"', async () => {
    const publishers = [
      { id: 1, firstname: 'Alice', lastname: 'Martin', activities: [] },
      { id: 2, firstname: 'Bob', lastname: 'Durand', activities: [] },
      { id: 3, firstname: 'Claire', lastname: "O'Connor", activities: [] },
    ]

    const buffer = await buildActivityPdfZip(publishers as never)
    const zip = await JsZip.loadAsync(buffer)

    expect(Object.keys(zip.files).sort()).toEqual(['Alice-Martin.pdf', 'Bob-Durand.pdf', "Claire-O'Connor.pdf"])
  })

  it('does not query the database', async () => {
    await buildActivityPdfZip([])

    expect(db.member.findMany).not.toHaveBeenCalled()
  })
})
