import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventTemplate: { findFirst: vi.fn(), create: vi.fn() },
    templatePartAllowedRole: { createMany: vi.fn() },
    templateServicePartAllowedRole: { createMany: vi.fn() },
  },
}))

const { duplicateTemplate } = await import('./duplicate-template.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('duplicateTemplate', () => {
  it('returns null when source template not found', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    const result = await duplicateTemplate(db, 99, 1)

    expect(result).toBeNull()
    expect(vi.mocked(db.eventTemplate.create)).not.toHaveBeenCalled()
  })

  // System templates are looked up by `key` at runtime. Duplicating them would
  // produce a row with an untethered `-copy-<ts>` suffix; the UI hides the
  // action but this is the server-side belt-and-suspenders check.
  it('returns null when the source is a system template', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 1,
      key: 'day-off',
      name: 'Absence',
      parts: [],
      serviceParts: [],
    } as never)

    const result = await duplicateTemplate(db, 1, 1)

    expect(result).toBeNull()
    expect(vi.mocked(db.eventTemplate.create)).not.toHaveBeenCalled()
  })

  it('copies allowed-role lists from source parts and service roles to the duplicate', async () => {
    const source = {
      id: 5,
      name: 'Reunion',
      key: 'midweek',
      description: '',
      weekDay: 2,
      isRecurring: true,
      parts: [
        {
          id: 10,
          name: 'Discours',
          section: '',
          track: '',
          order: 1,
          durationMin: 30,
          allowExternalSpeaker: false,
          allowedRoles: [
            { roleId: 100, asKind: 'speaker' },
            { roleId: 200, asKind: 'reader' },
          ],
        },
        {
          id: 11,
          name: 'Cantique',
          section: '',
          track: '',
          order: 2,
          durationMin: 5,
          allowExternalSpeaker: false,
          allowedRoles: [],
        },
      ],
      serviceParts: [
        { id: 20, name: 'Son', key: 'sono', allowedRoles: [{ roleId: 300 }] },
        { id: 21, name: 'Stage', key: 'stage', allowedRoles: [] },
      ],
    }
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(source as never)

    const duplicated = {
      id: 99,
      name: 'Reunion (copie)',
      parts: [
        { id: 510, order: 1 },
        { id: 511, order: 2 },
      ],
      serviceParts: [
        { id: 520, name: 'Son' },
        { id: 521, name: 'Stage' },
      ],
    }
    vi.mocked(db.eventTemplate.create).mockResolvedValue(duplicated as never)
    vi.mocked(db.templatePartAllowedRole.createMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(db.templateServicePartAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await duplicateTemplate(db, 5, 7)

    // Speaker role for the first part
    expect(vi.mocked(db.templatePartAllowedRole.createMany)).toHaveBeenCalledWith({
      data: [{ partId: 510, roleId: 100, asKind: 'speaker', congregationId: 7 }],
      skipDuplicates: true,
    })
    // Reader role for the first part
    expect(vi.mocked(db.templatePartAllowedRole.createMany)).toHaveBeenCalledWith({
      data: [{ partId: 510, roleId: 200, asKind: 'reader', congregationId: 7 }],
      skipDuplicates: true,
    })
    // Service-role allowed-roles for the first service role
    expect(vi.mocked(db.templateServicePartAllowedRole.createMany)).toHaveBeenCalledWith({
      data: [{ servicePartId: 520, roleId: 300, congregationId: 7 }],
      skipDuplicates: true,
    })
    // Empty lists are skipped
    expect(vi.mocked(db.templatePartAllowedRole.createMany)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(db.templateServicePartAllowedRole.createMany)).toHaveBeenCalledTimes(1)
  })

  // A duplicated template must carry the source's per-part role labels; without
  // this, admins who clone a template lose their custom labels silently.
  it('copies speakerLabel and readerLabel from source parts to the duplicate (Layer 4)', async () => {
    const source = {
      id: 5,
      name: 'Reunion',
      key: 'midweek',
      description: '',
      weekDay: 2,
      isRecurring: true,
      parts: [
        {
          id: 10,
          name: 'Bible reading',
          section: '',
          track: '',
          order: 1,
          durationMin: 5,
          allowExternalSpeaker: false,
          // Distinct sentinels per part so an ordering regression in the copy
          // loop (swapping parts[0] and parts[1]) fails visibly.
          speakerLabel: 'STUDENT-SENTINEL-P1',
          readerLabel: null,
          allowedRoles: [],
        },
        {
          id: 11,
          name: 'Return visit',
          section: '',
          track: '',
          order: 2,
          durationMin: 10,
          allowExternalSpeaker: false,
          speakerLabel: 'STUDENT-SENTINEL-P2',
          readerLabel: 'HOUSEHOLDER-SENTINEL-P2',
          allowedRoles: [],
        },
      ],
      serviceParts: [],
    }
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(source as never)
    vi.mocked(db.eventTemplate.create).mockResolvedValue({
      id: 99,
      name: 'Reunion (copie)',
      parts: [],
      serviceParts: [],
    } as never)

    await duplicateTemplate(db, 5, 7)

    const createCall = vi.mocked(db.eventTemplate.create).mock.calls[0][0] as {
      data: { parts: { create: Array<{ speakerLabel: string | null; readerLabel: string | null }> } }
    }
    const createdParts = createCall.data.parts.create
    expect(createdParts[0]).toMatchObject({ speakerLabel: 'STUDENT-SENTINEL-P1', readerLabel: null })
    expect(createdParts[1]).toMatchObject({
      speakerLabel: 'STUDENT-SENTINEL-P2',
      readerLabel: 'HOUSEHOLDER-SENTINEL-P2',
    })
  })
})
