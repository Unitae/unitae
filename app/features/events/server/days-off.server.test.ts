import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({ audit: vi.fn(), AuditAction: {} }))

vi.mock('~/shared/infra/db.server', () => ({
  db: {
    event: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    eventKind: { findFirst: vi.fn() },
    programmePartAssignment: { updateMany: vi.fn() },
    programmeServiceRoleAssignment: { updateMany: vi.fn() },
  },
  unscopedDb: { auditLog: { create: vi.fn().mockResolvedValue({}) } },
}))

const { createDayOff } = await import('./days-off.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  // Default: no overlapping programme events for conflict refresh
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
})

describe('createDayOff', () => {
  it('retourne null quand startDate est null', async () => {
    const result = await createDayOff(db, 1, null, new Date(2025, 3, 10), 1)
    expect(result).toBeNull()
  })

  it('retourne null quand endDate est null', async () => {
    const result = await createDayOff(db, 1, new Date(2025, 3, 8), null, 1)
    expect(result).toBeNull()
  })

  it('retourne null quand startDate est undefined', async () => {
    const result = await createDayOff(db, 1, undefined, new Date(2025, 3, 10), 1)
    expect(result).toBeNull()
  })

  it('retourne null quand startDate > endDate', async () => {
    const result = await createDayOff(db, 1, new Date(2025, 3, 15), new Date(2025, 3, 10), 1)
    expect(result).toBeNull()
  })

  it('crée un événement quand les dates sont valides', async () => {
    const fakeEvent = { id: 1, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue({ id: 5, key: 'off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)
    expect(result).toEqual(fakeEvent)
  })

  it('crée un événement même quand startDate == endDate', async () => {
    const sameDate = new Date(2025, 3, 8)
    const fakeEvent = { id: 2, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue({ id: 5, key: 'off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, sameDate, sameDate, 1)
    expect(result).toEqual(fakeEvent)
  })

  it("crée l'événement même sans eventKind trouvé", async () => {
    const fakeEvent = { id: 3, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)
    expect(result).toEqual(fakeEvent)
  })
})
