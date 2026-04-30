import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    user: { findMany: vi.fn() },
  },
}))

vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn(() => ({ toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')) })),
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

const { renderActivityPdfZip } = await import('./render-activity-pdf-zip.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.user.findMany).mockResolvedValue([] as never)
})

describe('renderActivityPdfZip', () => {
  it('filtre les activités de septembre à août (mois 8-11 puis 0-7)', async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([] as never)

    await renderActivityPdfZip(db, 1, 2025)

    const call = vi.mocked(db.user.findMany).mock.calls[0][0] as Record<string, unknown>
    const where = (call.where as { activities: { some: Record<string, unknown> } }).activities.some
    const include = (call.include as { activities: { where: Record<string, unknown> } }).activities.where

    // Vérifier le filtre WHERE (sélection des users)
    const whereOr = where.OR as { year: number; month: { gte?: number; lte?: number } }[]
    expect(whereOr[0]).toEqual({ year: 2025, month: { gte: 8 } })
    expect(whereOr[1]).toEqual({ year: 2026, month: { lte: 7 } })

    // Vérifier le filtre INCLUDE (sélection des activités)
    const includeOr = include.OR as { year: number; month: { gte?: number; lte?: number } }[]
    expect(includeOr[0]).toEqual({ year: 2025, month: { gte: 8 } })
    expect(includeOr[1]).toEqual({ year: 2026, month: { lte: 7 } })
  })
})
