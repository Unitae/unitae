import { beforeEach, describe, expect, it, vi } from 'vitest'

// biome-ignore lint/style/useNamingConvention: AuditAction is a PascalCase constant by convention
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))

import { createBoardSection, updateBoardSection } from './board-section.server'

const mockDb = {
  boardSection: {
    create: vi.fn(),
    update: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createBoardSection', () => {
  it('creates a board section with the given name and congregation', async () => {
    const expected = { id: 1, name: 'Annonces', congregationId: 10 }
    mockDb.boardSection.create.mockResolvedValue(expected)

    const result = await createBoardSection(mockDb as never, { name: 'Annonces', congregationId: 10, actorId: 99 })

    expect(result).toEqual(expected)
    expect(mockDb.boardSection.create).toHaveBeenCalledWith({
      data: { name: 'Annonces', congregationId: 10 },
    })
  })
})

describe('updateBoardSection', () => {
  it('updates a board section using compound key', async () => {
    const expected = { id: 5, name: 'Lettres', congregationId: 10 }
    mockDb.boardSection.update.mockResolvedValue(expected)

    const result = await updateBoardSection(mockDb as never, 5, 10, 99, { name: 'Lettres' })

    expect(result).toEqual(expected)
    expect(mockDb.boardSection.update).toHaveBeenCalledWith({
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      where: { id_congregationId: { id: 5, congregationId: 10 } },
      data: { name: 'Lettres' },
    })
  })
})
