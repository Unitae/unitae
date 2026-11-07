import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { boardDynamicDocumentSettings: { findFirst: vi.fn() } },
}))
vi.mock('~/features/display-board/index.server', () => ({
  buildSectionVisibilityFilter: vi.fn(async () => ({ OR: [] })),
}))

const { isProgrammeOnBoardFor } = await import('./programme-board-visibility.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

describe('isProgrammeOnBoardFor', () => {
  it('is false when the programme has no board document of its own', async () => {
    expect(await isProgrammeOnBoardFor(db, '/board', 3, 1)).toBe(false)
  })

  it('is true when the programme document is visible to the viewer now', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findFirst).mockResolvedValue({ id: 12 } as never)
    expect(await isProgrammeOnBoardFor(db, '/board/dynamic/12/viewer?eventId=55', 3, 1)).toBe(true)
  })

  it('is false when its section is closed to the viewer or it is out of its display window', async () => {
    vi.mocked(db.boardDynamicDocumentSettings.findFirst).mockResolvedValue(null as never)
    expect(await isProgrammeOnBoardFor(db, '/board/dynamic/12/viewer?eventId=55', 3, 1)).toBe(false)
  })
})
