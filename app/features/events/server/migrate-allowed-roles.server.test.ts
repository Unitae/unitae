import { beforeEach, describe, expect, it, vi } from 'vitest'

const setPartPresetAllowedRoles = vi.fn().mockResolvedValue({ added: [], removed: [] })
vi.mock('./allowed-roles.server', () => ({
  setPartPresetAllowedRoles: (...args: unknown[]) => setPartPresetAllowedRoles(...args),
}))

const { migrateAllowedRolesToPresets } = await import('./migrate-allowed-roles.server')

function makeDb(parts: unknown[], presetRows: unknown[] = []) {
  return {
    partPreset: { findMany: vi.fn().mockResolvedValue([{ id: 55, name: 'Sujet' }] as never) },
    templatePart: { findMany: vi.fn().mockResolvedValue(parts as never) },
    partPresetAllowedRole: { findMany: vi.fn().mockResolvedValue(presetRows as never) },
  }
}

function part(id: number, roles: { roleId: number; asKind: string }[]) {
  return { id, presetId: 55, allowedRoles: roles }
}

beforeEach(() => {
  vi.resetAllMocks()
  setPartPresetAllowedRoles.mockResolvedValue({ added: [], removed: [] })
})

describe('migrateAllowedRolesToPresets', () => {
  it('copies the roles up when every part using the kind agrees', async () => {
    const db = makeDb([part(1, [{ roleId: 7, asKind: 'speaker' }]), part(2, [{ roleId: 7, asKind: 'speaker' }])])

    const result = await migrateAllowedRolesToPresets(db as never, 1)

    expect(setPartPresetAllowedRoles).toHaveBeenCalledWith(expect.anything(), 55, 'speaker', [7], 1)
    expect(result.migrated).toBe(1)
  })

  it('refuses when the parts disagree, rather than merging them', async () => {
    // A union would widen eligibility for the stricter part; an intersection
    // would narrow it for the looser one. Both change who can be assigned
    // without anyone asking, so neither is safe to do silently.
    const db = makeDb([part(1, [{ roleId: 7, asKind: 'speaker' }]), part(2, [{ roleId: 8, asKind: 'speaker' }])])

    const result = await migrateAllowedRolesToPresets(db as never, 1)

    expect(setPartPresetAllowedRoles).not.toHaveBeenCalled()
    expect(result.conflicts).toEqual([{ preset: 'Sujet', asKind: 'speaker' }])
  })

  it('treats a part with no roles as disagreeing with one that has some', async () => {
    // Empty means "any member". Copying the restrictive set up would quietly
    // narrow the unrestricted part.
    const db = makeDb([part(1, [{ roleId: 7, asKind: 'speaker' }]), part(2, [])])

    const result = await migrateAllowedRolesToPresets(db as never, 1)

    expect(setPartPresetAllowedRoles).not.toHaveBeenCalled()
    expect(result.conflicts).toHaveLength(1)
  })

  it('handles the two slots independently', async () => {
    const db = makeDb([
      part(1, [
        { roleId: 7, asKind: 'speaker' },
        { roleId: 9, asKind: 'reader' },
      ]),
      part(2, [
        { roleId: 7, asKind: 'speaker' },
        { roleId: 10, asKind: 'reader' },
      ]),
    ])

    const result = await migrateAllowedRolesToPresets(db as never, 1)

    // Speaker agrees and migrates; reader disagrees and does not.
    expect(setPartPresetAllowedRoles).toHaveBeenCalledWith(expect.anything(), 55, 'speaker', [7], 1)
    expect(result.conflicts).toEqual([{ preset: 'Sujet', asKind: 'reader' }])
  })

  it('leaves a kind alone once it already has roles', async () => {
    // Re-running must not overwrite a decision someone made by hand.
    const db = makeDb([part(1, [{ roleId: 7, asKind: 'speaker' }])], [{ asKind: 'speaker' }])

    await migrateAllowedRolesToPresets(db as never, 1)

    expect(setPartPresetAllowedRoles).not.toHaveBeenCalled()
  })

  it('skips a kind no part uses', async () => {
    const db = makeDb([])

    const result = await migrateAllowedRolesToPresets(db as never, 1)

    expect(setPartPresetAllowedRoles).not.toHaveBeenCalled()
    expect(result.migrated).toBe(0)
  })

  it('ignores parts that have no restriction at all', async () => {
    const db = makeDb([part(1, []), part(2, [])])

    const result = await migrateAllowedRolesToPresets(db as never, 1)

    expect(setPartPresetAllowedRoles).not.toHaveBeenCalled()
    expect(result.migrated).toBe(0)
    expect(result.conflicts).toEqual([])
  })
})
