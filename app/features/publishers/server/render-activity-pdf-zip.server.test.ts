import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    user: { findMany: vi.fn() },
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

vi.mock('~/shared/auth/sanitize-user.server', () => ({
  sanitizeUser: vi.fn((u: unknown) => u),
}))

vi.mock('~/features/publishers/ui/PublisherActivityDocument', () => ({
  PublisherActivityDocument: vi.fn(() => null),
}))

const { buildActivityPdfZip, getPublishersWithYearActivities } = await import('./render-activity-pdf-zip.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  toBuffer.mockResolvedValue(Buffer.from('fake-pdf'))
  vi.mocked(db.user.findMany).mockResolvedValue([] as never)
})

describe('getPublishersWithYearActivities', () => {
  it('filters activities from September to August (months 8-11 then 0-7)', async () => {
    await getPublishersWithYearActivities(db, 1, 2025)

    const call = vi.mocked(db.user.findMany).mock.calls[0][0] as Record<string, unknown>
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
    vi.mocked(db.user.findMany).mockResolvedValue([{ id: 1, firstname: 'Jean', lastname: 'Dupont' }] as never)

    await getPublishersWithYearActivities(db, 1, 2025)

    expect(pdf).not.toHaveBeenCalled()
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

  it('does not query the database', async () => {
    await buildActivityPdfZip([])

    expect(db.user.findMany).not.toHaveBeenCalled()
  })
})
