import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { findMany: vi.fn() },
  },
}))

vi.mock('./allowed-roles.server', () => ({
  getPartAssignmentAllowedRoleIds: vi.fn(),
  resolveEligibleUserIds: vi.fn(),
}))

vi.mock('./external-speakers.server', () => ({
  listExternalSpeakers: vi.fn(),
}))

const { loadPartAssignmentCandidates } = await import('./assign-part-loader.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const allowedRoles = await import('./allowed-roles.server')
const externalSpeakers = await import('./external-speakers.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.member.findMany).mockResolvedValue([
    { id: 1, firstname: 'A', lastname: 'Z' },
    { id: 2, firstname: 'B', lastname: 'Y' },
  ] as never)
})

describe('loadPartAssignmentCandidates', () => {
  it('returns every member as candidates when no assignment is provided', async () => {
    const result = await loadPartAssignmentCandidates(db, undefined, 1)
    expect(result.speakerCandidates).toHaveLength(2)
    expect(result.readerCandidates).toHaveLength(2)
    expect(result.externalSpeakers).toEqual([])
    expect(allowedRoles.getPartAssignmentAllowedRoleIds).not.toHaveBeenCalled()
  })

  it('narrows speaker and reader pools via eligibility resolution', async () => {
    vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValue([9])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValueOnce([1]).mockResolvedValueOnce([2])

    const result = await loadPartAssignmentCandidates(db, { id: 5, allowExternalSpeaker: false }, 1)
    expect(result.speakerCandidates.map(u => u.id)).toEqual([1])
    expect(result.readerCandidates.map(u => u.id)).toEqual([2])
    expect(result.externalSpeakers).toEqual([])
  })

  it('sorts external speakers by last-visit date then name when allowed', async () => {
    vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValue([])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValue([])
    vi.mocked(externalSpeakers.listExternalSpeakers).mockResolvedValue([
      { id: 1, name: 'Charlie', lastVisitDate: new Date('2026-05-01') },
      { id: 2, name: 'Alice', lastVisitDate: new Date('2026-05-01') },
      { id: 3, name: 'Bob', lastVisitDate: null },
    ] as never)

    const result = await loadPartAssignmentCandidates(db, { id: 5, allowExternalSpeaker: true }, 1)
    expect(result.externalSpeakers.map(s => s.name)).toEqual(['Bob', 'Alice', 'Charlie'])
  })
})

describe('the external-speaker registry follows the kind, not the part column', () => {
  // resolvePartCapability makes the kind authoritative including when it says
  // no. Reading the part's raw column here meant a Discours Public could not
  // be given a visiting speaker, and a Joyaux spirituels still offered one.
  it('loads the registry when the kind allows an external speaker', async () => {
    vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValue([])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValue([1])
    vi.mocked(externalSpeakers.listExternalSpeakers).mockResolvedValue([
      { id: 1, name: 'Visiteur', lastVisitDate: null },
    ] as never)

    const result = await loadPartAssignmentCandidates(
      db,
      {
        id: 5,
        allowExternalSpeaker: false,
        preset: { speakerLabel: null, readerLabel: null, hasReaderSlot: false, allowExternalSpeaker: true },
      },
      1,
    )

    expect(result.externalSpeakers).toHaveLength(1)
    expect(result.capability.allowExternalSpeaker).toBe(true)
  })

  it('withholds it when the kind forbids one', async () => {
    vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValue([])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValue([1])

    const result = await loadPartAssignmentCandidates(
      db,
      {
        id: 5,
        allowExternalSpeaker: true,
        preset: { speakerLabel: null, readerLabel: null, hasReaderSlot: false, allowExternalSpeaker: false },
      },
      1,
    )

    expect(result.externalSpeakers).toEqual([])
    expect(result.capability.allowExternalSpeaker).toBe(false)
    expect(externalSpeakers.listExternalSpeakers).not.toHaveBeenCalled()
  })

  it("falls back to the part's own column when it has no kind", async () => {
    vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValue([])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValue([1])
    vi.mocked(externalSpeakers.listExternalSpeakers).mockResolvedValue([
      { id: 1, name: 'Visiteur', lastVisitDate: null },
    ] as never)

    const result = await loadPartAssignmentCandidates(db, { id: 5, allowExternalSpeaker: true, preset: null }, 1)

    expect(result.externalSpeakers).toHaveLength(1)
    expect(result.capability.allowExternalSpeaker).toBe(true)
  })
})
