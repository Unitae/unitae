import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSetting = vi.fn()
vi.mock('~/shared/domain/settings.server', () => ({ getSetting: (...args: unknown[]) => getSetting(...args) }))

const mockDb = {
  ourSpeaker: { count: vi.fn() },
  role: { findMany: vi.fn() },
  memberRoleAssignment: { findMany: vi.fn() },
  speakerCongregation: { findMany: vi.fn() },
}

const { countOurList, getOurSpeakerListPage } = await import('./our-speakers.queries')

beforeEach(() => {
  vi.resetAllMocks()
})

function member(id: number, firstname: string, lastname: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    firstname,
    lastname,
    phone: '06 00 00 00 0' + id,
    email: `${firstname.toLowerCase()}@exemple.fr`,
    isHelder: false,
    isServant: false,
    updatedAt: new Date('2026-10-01'),
    ourSpeaker: null,
    ...extra,
  }
}

const entry = (onList: boolean, extra: Record<string, unknown> = {}) => ({
  onList,
  talks: [4, 26],
  note: '',
  phoneMode: 'record',
  phoneCustom: '',
  phone2: '',
  emailMode: 'record',
  emailCustom: '',
  email2: '',
  updatedAt: new Date('2026-11-02'),
  ...extra,
})

function settings(candidates: string | undefined, responsible: string | undefined) {
  getSetting.mockImplementation((_db: unknown, key: string) =>
    Promise.resolve(key === 'external-speakers-candidates-role' ? candidates : responsible),
  )
}

describe('getOurSpeakerListPage', () => {
  it('lists nothing until a role is chosen in Réglages', async () => {
    settings(undefined, undefined)
    mockDb.role.findMany.mockResolvedValue([])
    mockDb.memberRoleAssignment.findMany.mockResolvedValue([])
    mockDb.speakerCongregation.findMany.mockResolvedValue([])

    const page = await getOurSpeakerListPage(mockDb as never, 1)

    expect(page.candidatesRole).toBeNull()
    expect(page.brothers).toEqual([])
  })

  it('lists the role’s members once each, with what goes on the list, and the two contacts at its head', async () => {
    settings('orateurs', 'coord-discours')
    mockDb.role.findMany.mockResolvedValue([
      { key: 'orateurs', name: 'Orateurs publics' },
      { key: 'coord-discours', name: 'Coordinateur du programme des discours publics' },
    ])
    const marc = member(2, 'Marc', 'Dupont', {
      isHelder: true,
      ourSpeaker: entry(true, { emailMode: 'custom', emailCustom: 'discours.lilas@exemple.fr' }),
    })
    const paul = member(3, 'Paul', 'Martin', { isServant: true })
    const pascal = member(1, 'Pascal', 'Durand')
    const albert = member(5, 'Albert', 'Zola')
    mockDb.memberRoleAssignment.findMany.mockImplementation(({ where }) => {
      const key = where.role.key
      if (key === 'orateurs')
        return Promise.resolve([
          { kind: 'member', member: paul },
          { kind: 'member', member: albert },
          { kind: 'member', member: marc },
          { kind: 'leader', member: marc },
        ])
      if (key === 'coord-discours') return Promise.resolve([{ kind: 'leader', member: marc }])
      if (key === 'coordinator')
        return Promise.resolve([
          { kind: 'deputy', member: paul },
          { kind: 'leader', member: pascal },
        ])
      return Promise.resolve([])
    })
    mockDb.speakerCongregation.findMany.mockResolvedValue([])

    const page = await getOurSpeakerListPage(mockDb as never, 1)

    expect(page.candidatesRole).toEqual({ key: 'orateurs', name: 'Orateurs publics' })
    expect(page.brothers.map(b => [b.name, b.appointment, b.onList])).toEqual([
      ['Marc DUPONT', 'elder', true],
      ['Paul MARTIN', 'servant', false],
      // By last name, as every list of people in the app.
      ['Albert ZOLA', null, false],
    ])
    expect(page.brothers[0]?.shared).toEqual({ phones: ['06 00 00 00 02'], emails: ['discours.lilas@exemple.fr'] })
    expect(page.header.coordinator).toEqual({
      name: 'Pascal DURAND',
      phone: '06 00 00 00 01',
      email: 'pascal@exemple.fr',
    })
    // His shared contact, not his record: the list is what congregations call.
    expect(page.header.responsible).toEqual({
      name: 'Marc DUPONT',
      phone: '06 00 00 00 02',
      email: 'discours.lilas@exemple.fr',
    })
    const where = mockDb.memberRoleAssignment.findMany.mock.calls[0]?.[0].where
    expect(where.member).toMatchObject({ leftAt: null, anonymizedAt: null })
  })

  it('says which congregations hold today’s list: sent with the same content, not merely sent after a change', async () => {
    settings('orateurs', undefined)
    mockDb.role.findMany.mockResolvedValue([{ key: 'orateurs', name: 'Orateurs publics' }])
    mockDb.memberRoleAssignment.findMany.mockImplementation(({ where }) =>
      Promise.resolve(
        where.role.key === 'orateurs'
          ? [{ kind: 'member', member: member(2, 'Marc', 'Dupont', { ourSpeaker: entry(true) }) }]
          : [],
      ),
    )
    const recipient = (id: number, sentAt: Date | null, digest: string | null) => ({
      id,
      name: `C${id}`,
      responsibleName: '',
      responsibleEmail: `r${id}@exemple.fr`,
      coordinatorName: '',
      coordinatorEmail: '',
      ourListSentAt: sentAt,
      ourListSentManually: false,
      ourListSentDigest: digest,
    })
    mockDb.speakerCongregation.findMany.mockResolvedValue([recipient(1, null, null)])
    const { digest } = await getOurSpeakerListPage(mockDb as never, 1)
    mockDb.speakerCongregation.findMany.mockResolvedValue([
      recipient(1, null, null),
      // Sent before Marc's entry was last saved, but the same list: still current.
      recipient(2, new Date('2026-10-03'), digest),
      // Sent recently, but another list (a brother since gone, say): out of date.
      recipient(3, new Date('2026-11-05'), 'another list'),
    ])

    const page = await getOurSpeakerListPage(mockDb as never, 1)

    expect(page.digest).toBe(digest)
    expect(page.recipients.map(r => [r.name, r.outdated])).toEqual([
      ['C1', true],
      ['C2', false],
      ['C3', true],
    ])
  })
})

describe('countOurList', () => {
  it('counts the brothers on our list who are still candidates, for the page’s tab', async () => {
    settings('orateurs', undefined)
    mockDb.ourSpeaker.count.mockResolvedValue(8)

    expect(await countOurList(mockDb as never, 1)).toBe(8)
    expect(mockDb.ourSpeaker.count).toHaveBeenCalledWith({
      where: {
        congregationId: 1,
        onList: true,
        member: { leftAt: null, anonymizedAt: null, roleAssignments: { some: { role: { key: 'orateurs' } } } },
      },
    })
  })

  it('is nought while no role is chosen in Réglages', async () => {
    settings(undefined, undefined)

    expect(await countOurList(mockDb as never, 1)).toBe(0)
    expect(mockDb.ourSpeaker.count).not.toHaveBeenCalled()
  })
})
