import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublisherListFilters } from '~/features/publishers/model/publisher-list-filters'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { member: { findMany: vi.fn() } } }))
vi.mock('~/features/events/index.server', () => ({
  findLastAssignmentsForMembers: vi.fn(),
  findNextAbsencesForMembers: vi.fn(),
}))

const { listPublishers, privilegesOf, publisherListWhere } = await import('./list-publishers.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const events = await import('~/features/events/index.server')

const NOW = new Date(Date.UTC(2026, 10, 7, 12))
const ACTIVE: PublisherListFilters = { search: '', groupIds: [], privilege: null, status: 'active' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(events.findLastAssignmentsForMembers).mockResolvedValue(new Map())
  vi.mocked(events.findNextAbsencesForMembers).mockResolvedValue(new Map())
})

describe('privilegesOf', () => {
  it('lists the appointments first, then the ongoing pioneer service', () => {
    expect(
      privilegesOf({
        isHelder: true,
        isServant: false,
        pioneerEnrolments: [{ type: PublisherType.PionnierPermanant }],
      }),
    ).toEqual(['elder', 'regular-pioneer'])
    expect(privilegesOf({ isHelder: false, isServant: true, pioneerEnrolments: [] })).toEqual(['servant'])
  })
})

describe('publisherListWhere', () => {
  it('keeps active publishers by default', () => {
    expect(publisherListWhere(1, ACTIVE)).toEqual({
      congregationId: 1,
      isPublisher: true,
      leftAt: null,
      inactiveAt: null,
    })
  })

  it('narrows by name, groups and privilege, and switches to those who left', () => {
    expect(
      publisherListWhere(1, { search: 'mar', groupIds: [2], privilege: 'auxiliary-pioneer', status: 'left' }),
    ).toEqual({
      congregationId: 1,
      isPublisher: true,
      leftAt: { not: null },
      anonymizedAt: null,
      publisherGroupId: { in: [2] },
      pioneerEnrolments: { some: { type: PublisherType.PionnierAuxiliaires, endMonth: null } },
      OR: [
        { firstname: { contains: 'mar', mode: 'insensitive' } },
        { lastname: { contains: 'mar', mode: 'insensitive' } },
      ],
    })
    expect(publisherListWhere(1, { ...ACTIVE, privilege: 'elder', status: 'inactive' })).toMatchObject({
      leftAt: null,
      inactiveAt: { not: null },
      isHelder: true,
    })
  })
})

describe('listPublishers', () => {
  const member = {
    id: 7,
    firstname: 'Élodie',
    lastname: 'Martin',
    isMale: false,
    isHelder: false,
    isServant: false,
    leftAt: null,
    publisherGroup: { id: 2, name: 'Groupe 1' },
    pioneerEnrolments: [{ type: PublisherType.PionnierAuxiliaires }],
  }

  it('joins each publisher’s last part and, for those who may see it, their next absence', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([member] as never)
    vi.mocked(events.findLastAssignmentsForMembers).mockResolvedValue(
      new Map([[7, { partName: 'Lecture de la Bible', date: new Date(2026, 9, 29) }]]) as never,
    )
    vi.mocked(events.findNextAbsencesForMembers).mockResolvedValue(
      new Map([[7, { startDate: new Date(2026, 11, 14), endDate: new Date(2026, 11, 21) }]]) as never,
    )

    const rows = await listPublishers(db, 1, ACTIVE, { includeAbsences: true, now: NOW })

    expect(rows).toEqual([
      {
        id: 7,
        firstname: 'Élodie',
        lastname: 'Martin',
        isMale: false,
        group: { id: 2, name: 'Groupe 1' },
        privileges: ['auxiliary-pioneer'],
        leftAt: null,
        lastAssignment: { partName: 'Lecture de la Bible', date: new Date(2026, 9, 29) },
        nextAbsence: { startDate: new Date(2026, 11, 14), endDate: new Date(2026, 11, 21) },
      },
    ])
  })

  it('leaves absences out for someone without the right to see them', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([member] as never)
    vi.mocked(events.findNextAbsencesForMembers).mockResolvedValue(
      new Map([[7, { startDate: new Date(2026, 11, 14), endDate: null }]]) as never,
    )

    const [row] = await listPublishers(db, 1, ACTIVE, { includeAbsences: false, now: NOW })

    expect(row.nextAbsence).toBeNull()
  })
})
