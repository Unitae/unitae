import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn() },
  },
}))

const { getEventsForExport, programmeExportInclude } = await import('./programme-export.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

describe('getEventsForExport', () => {
  it('includes the externalSpeaker relation on partAssignments', () => {
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)

    getEventsForExport(db, [1], new Date('2026-01-01'), new Date('2026-01-31'))

    const call = vi.mocked(db.event.findMany).mock.calls[0]?.[0]
    expect(call?.include?.partAssignments).toBeDefined()
    const partAssignments = call?.include?.partAssignments as { include: Record<string, unknown> }
    expect(partAssignments.include.externalSpeaker).toBe(true)
    expect(partAssignments.include.assignee).toBe(true)
    expect(partAssignments.include.assistant).toBe(true)
  })
})

describe('programmeExportInclude', () => {
  it('is the canonical include shape for export queries', () => {
    expect(programmeExportInclude.partAssignments.include).toEqual({
      assignee: true,
      assistant: true,
      externalSpeaker: true,
    })
  })
})
