import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn() },
  },
}))

const { getEventsForExport, programmeExportInclude } = await import('./programme-export.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

describe('getEventsForExport', () => {
  it('includes the externalSpeaker relation on parts', () => {
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)

    getEventsForExport(db, [1], new Date('2026-01-01'), new Date('2026-01-31'))

    const call = vi.mocked(db.event.findMany).mock.calls[0]?.[0]
    expect(call?.include?.parts).toBeDefined()
    const parts = call?.include?.parts as { include: Record<string, unknown> }
    expect(parts.include.externalSpeaker).toBe(true)
    expect(parts.include.assignee).toBe(true)
    expect(parts.include.assistant).toBe(true)
  })
})

describe('programmeExportInclude', () => {
  it('is the canonical include shape for export queries', () => {
    expect(programmeExportInclude.parts.include).toEqual({
      assignee: true,
      assistant: true,
      externalSpeaker: true,
    })
  })
})
