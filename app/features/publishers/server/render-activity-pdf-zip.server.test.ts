import JsZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { findMany: vi.fn() },
  },
}))

const renderPdfBuffer = vi.fn()
vi.mock('~/shared/infra/pdf.server', () => ({
  renderPdfBuffer: (...args: unknown[]) => renderPdfBuffer(...args),
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
  renderPdfBuffer.mockResolvedValue(Buffer.from('fake-pdf'))
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
    vi.mocked(db.member.findMany).mockResolvedValue([{ id: 1, firstname: 'Jean', lastname: 'Dupont' }] as never)

    await getPublishersWithYearActivities(db, 1, 2025)

    expect(renderPdfBuffer).not.toHaveBeenCalled()
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

    const buffer = await buildActivityPdfZip(publishers as never, 2025)

    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(renderPdfBuffer).toHaveBeenCalledTimes(2)
  })

  it('writes one entry per publisher named "{firstname}-{lastname}.pdf"', async () => {
    const publishers = [
      { id: 1, firstname: 'Alice', lastname: 'Martin', activities: [] },
      { id: 2, firstname: 'Bob', lastname: 'Durand', activities: [] },
      { id: 3, firstname: 'Claire', lastname: "O'Connor", activities: [] },
    ]

    const buffer = await buildActivityPdfZip(publishers as never, 2025)
    const zip = await JsZip.loadAsync(buffer)

    expect(Object.keys(zip.files).sort()).toEqual(['Alice-Martin.pdf', 'Bob-Durand.pdf', "Claire-O'Connor.pdf"])
  })

  it('passes the requested service year to every document', async () => {
    // Only the threading is proven here; the sheet layout for a given year is covered by
    // service-year-activity-rows.test.ts.
    const publishers = [{ id: 1, firstname: 'Aubeline', lastname: 'Martin', activities: [] }]

    await buildActivityPdfZip(publishers as never, 2024)

    expect(renderPdfBuffer).toHaveBeenCalledTimes(1)
    const element = renderPdfBuffer.mock.calls[0][0] as { props: Record<string, unknown> }
    expect(element.props).toMatchObject({ serviceYear: 2024 })
  })

  // A visitor's demo copy: every record in the archive says it's a demo.
  it('marks every document when the archive comes from a demo copy', async () => {
    const publishers = [
      { id: 1, firstname: 'Alice', lastname: 'Martin', activities: [] },
      { id: 2, firstname: 'Bob', lastname: 'Durand', activities: [] },
    ]

    await buildActivityPdfZip(publishers as never, 2025, { demo: true })

    expect(renderPdfBuffer.mock.calls.map(call => call[1])).toEqual([{ demo: true }, { demo: true }])
  })

  it('does not query the database', async () => {
    await buildActivityPdfZip([], 2025)

    expect(db.member.findMany).not.toHaveBeenCalled()
  })
})
