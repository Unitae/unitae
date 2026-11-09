import { describe, expect, it, vi } from 'vitest'
import type { TransactionClient } from '~/shared/infra/db.server'

import { getEnrolmentOptions, getPublisherRecord, getRecordReportMonths } from './publisher-record.queries'

vi.mock('./pioneer-goals.queries', () => ({
  listPioneerGoalsForYear: vi.fn((_db: unknown, serviceYear: number) => [
    { type: 'PionnierAuxiliaires', effectiveRate: serviceYear === 2027 ? 25 : 30 },
    { type: 'PionnierPermanant', effectiveRate: 50 },
    { type: 'PionnierSpecial', effectiveRate: 100 },
    { type: 'Missionnaire', effectiveRate: 100 },
  ]),
}))
vi.mock('~/shared/domain/settings.server', () => ({ getBoolSetting: vi.fn(() => false) }))

// The publisher record's read: who the person is and how to reach them, their group and its leaders by name, and
// their login only for those who manage publishers. It names every column it reads, so reports, emergency flags and
// enrolments never travel with the record: each has its own read, behind its own right.

const ROW = {
  id: 12,
  firstname: 'Patrick',
  lastname: 'Fontaine',
  isMale: true,
  birthDate: new Date('1981-05-14T00:00:00Z'),
  baptismDate: new Date('2000-03-12T00:00:00Z'),
  arrivedAt: new Date('2021-09-05T00:00:00Z'),
  lastPastoralVisitAt: null,
  phone: '06 12 34 56 78',
  email: 'patrick.fontaine@exemple.fr',
  address: '8 allée des Tilleuls',
  isAnointed: false,
  isHelder: false,
  isServant: true,
  isPublisher: true,
  leftAt: null,
  inactiveAt: null,
  publisherGroup: {
    id: 3,
    name: 'Nord',
    responsible: { id: 5, firstname: 'Marc', lastname: 'Dupont' },
    deputy: null,
  },
  account: { email: 'p.fontaine@exemple.fr' },
}

function fakeDb(row: typeof ROW | null) {
  const findFirst = vi.fn((args: { select: Record<string, unknown> }) => {
    if (row == null) return null
    // Hand back only what was asked for, like Prisma does.
    return Object.fromEntries(Object.entries(row).filter(([key]) => args.select[key]))
  })
  return { db: { member: { findFirst } } as unknown as TransactionClient, findFirst }
}

describe('getPublisherRecord', () => {
  it('reads the person, their group with its leaders, and their login for a manager', async () => {
    const { db } = fakeDb(ROW)
    const record = await getPublisherRecord(db, 12, 1, { withLogin: true })
    expect(record).toMatchObject({
      id: 12,
      firstname: 'Patrick',
      phone: '06 12 34 56 78',
      isServant: true,
      group: { id: 3, name: 'Nord', responsible: { firstname: 'Marc', lastname: 'Dupont' }, deputy: null },
      login: { email: 'p.fontaine@exemple.fr' },
    })
  })

  it('leaves the login out for everyone else', async () => {
    const { db, findFirst } = fakeDb(ROW)
    const record = await getPublisherRecord(db, 12, 1, { withLogin: false })
    expect(record?.login).toBeNull()
    expect(findFirst.mock.calls[0]?.[0].select.account).toBeFalsy()
  })

  it('never reads reports, emergency flags, enrolments or the leaders’ own details', async () => {
    const { db, findFirst } = fakeDb(ROW)
    await getPublisherRecord(db, 12, 1, { withLogin: true })
    const select = findFirst.mock.calls[0]?.[0].select as Record<string, unknown>
    for (const column of ['activities', 'dpaCardUpToDate', 'survivalBackpackReady', 'pioneerEnrolments']) {
      expect(select[column]).toBeUndefined()
    }
    expect(select.publisherGroup).toEqual({
      select: {
        id: true,
        name: true,
        responsible: { select: { id: true, firstname: true, lastname: true } },
        deputy: { select: { id: true, firstname: true, lastname: true } },
      },
    })
  })

  it('finds nobody outside the congregation', async () => {
    const { db, findFirst } = fakeDb(null)
    expect(await getPublisherRecord(db, 12, 1, { withLogin: true })).toBeNull()
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: 12, congregationId: 1 } })
  })
})

describe('getEnrolmentOptions', () => {
  it('offers this month and the next with their auxiliary rate, the rates of the year and the services in use', async () => {
    const { db } = fakeDb(null)
    const options = await getEnrolmentOptions(db, 1, new Date('2027-08-14T10:00:00Z'))
    // August closes service year 2026, September opens 2027 and its rate.
    expect(options.months).toEqual([
      { month: 7, year: 2027, auxiliaryGoal: 30 },
      { month: 8, year: 2027, auxiliaryGoal: 25 },
    ])
    expect(options.rates).toMatchObject({ 'monthly-aux': 30, 'permanent-aux': 30, permanent: 50, special: 100 })
    expect(options.years).toEqual([2025, 2026, 2027, 2028, 2029])
    expect(options.hidePermanentAuxiliary).toBe(true)
  })
})

describe('getRecordReportMonths', () => {
  function reportsDb(reports: { id: number; month: number; year: number; isPublisher: boolean }[], createdAt: Date) {
    return {
      member: { findFirst: vi.fn(() => ({ createdAt })) },
      publisherActivity: { findMany: vi.fn(() => [...reports].sort((a, b) => b.id - a.id)) },
    } as unknown as TransactionClient
  }

  it('reads the service year month by month: filed, without preaching, missing, and not yet due', async () => {
    const db = reportsDb(
      [
        { id: 1, month: 8, year: 2026, isPublisher: true },
        { id: 2, month: 9, year: 2026, isPublisher: false },
      ],
      new Date('2024-01-10T00:00:00Z'),
    )
    const months = await getRecordReportMonths(db, 12, 1, {
      serviceYear: 2026,
      today: new Date(2026, 11, 3),
      timeZone: 'UTC',
    })
    expect(months.slice(0, 4)).toEqual([
      { month: 8, year: 2026, status: 'filed', id: 1 },
      { month: 9, year: 2026, status: 'irregular', id: 2 },
      { month: 10, year: 2026, status: 'not-filed', id: null },
      { month: 11, year: 2026, status: 'not-expected', id: null },
    ])
    expect(months).toHaveLength(12)
  })

  it('expects nothing before the person was added', async () => {
    const db = reportsDb([], new Date(2026, 9, 20))
    const months = await getRecordReportMonths(db, 12, 1, {
      serviceYear: 2026,
      today: new Date(2026, 11, 3),
      timeZone: 'UTC',
    })
    expect(months.slice(0, 3).map(month => month.status)).toEqual(['not-expected', 'not-filed', 'not-filed'])
  })
})
