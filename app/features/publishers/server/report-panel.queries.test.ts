import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

// The report panel's read: who the publisher is, the report filed for the month (the latest, when one was filed
// twice), the enrolment covering the month, and the congregation's rates for the month's service year.

const { enrolments, goals } = vi.hoisted(() => ({
  enrolments: new Map<string, { type: string; goal: number }>(),
  goals: new Map<number, { type: string; effectiveRate: number }[]>(),
}))

vi.mock('./pioneer-enrolment.queries', () => ({
  getMonthEnrolment: vi.fn(
    (_db: unknown, memberId: number, _c: number, month: number, year: number) =>
      enrolments.get(`${memberId}:${month}:${year}`) ?? null,
  ),
}))
vi.mock('./pioneer-goals.queries', () => ({
  listPioneerGoalsForYear: vi.fn((_db: unknown, serviceYear: number) => goals.get(serviceYear) ?? []),
}))

const { getReportPanelData } = await import('./report-panel.queries')

const SYLVIE = {
  id: 6,
  firstname: 'Sylvie',
  lastname: 'BERNARD',
  publisherGroupId: 3,
  publisherGroup: { name: 'Sud' },
}

function fakeDb(rows: { member?: typeof SYLVIE | null; reports?: Record<string, unknown>[] }) {
  return {
    member: { findFirst: vi.fn(() => rows.member ?? null) },
    publisherActivity: {
      findFirst: vi.fn(() => {
        const sorted = [...(rows.reports ?? [])].sort((a, b) => Number(b.id) - Number(a.id))
        return sorted[0] ?? null
      }),
    },
  } as unknown as TransactionClient
}

beforeEach(() => {
  enrolments.clear()
  goals.clear()
})

describe('getReportPanelData', () => {
  it('returns nothing for a member of no congregation the caller can see', async () => {
    expect(await getReportPanelData(fakeDb({ member: null }), 1, { publisherId: 6, month: 9, year: 2026 })).toBeNull()
  })

  it("names the publisher's group and states the month's enrolment and the year's rates", async () => {
    enrolments.set('6:9:2026', { type: PublisherType.PionnierPermanant, goal: 50 })
    goals.set(2026, [
      { type: PublisherType.PionnierAuxiliaires, effectiveRate: 30 },
      { type: PublisherType.PionnierPermanant, effectiveRate: 50 },
    ])

    const data = await getReportPanelData(fakeDb({ member: SYLVIE }), 1, { publisherId: 6, month: 9, year: 2026 })

    expect(data).toEqual({
      publisher: { id: 6, firstname: 'Sylvie', lastname: 'BERNARD', groupId: 3, groupName: 'Sud' },
      month: 9,
      year: 2026,
      report: null,
      enrolment: { type: PublisherType.PionnierPermanant, goal: 50 },
      rates: { [PublisherType.PionnierAuxiliaires]: 30, [PublisherType.PionnierPermanant]: 50 },
    })
  })

  it('takes the rates of the service year the month belongs to', async () => {
    goals.set(2025, [{ type: PublisherType.PionnierAuxiliaires, effectiveRate: 15 }])
    goals.set(2026, [{ type: PublisherType.PionnierAuxiliaires, effectiveRate: 30 }])

    // March 2026 falls in the service year that began in September 2025.
    const data = await getReportPanelData(fakeDb({ member: SYLVIE }), 1, { publisherId: 6, month: 2, year: 2026 })

    expect(data?.rates).toEqual({ [PublisherType.PionnierAuxiliaires]: 15 })
  })

  it('returns the latest report when the month was filed twice', async () => {
    const report = (id: number, hours: number) => ({
      id,
      type: PublisherType.PionnierPermanant,
      hours,
      studies: 1,
      isPublisher: true,
      notes: '',
      creditHours: null,
    })

    const data = await getReportPanelData(fakeDb({ member: SYLVIE, reports: [report(40, 30), report(41, 42)] }), 1, {
      publisherId: 6,
      month: 9,
      year: 2026,
    })

    expect(data?.report).toEqual(report(41, 42))
  })
})
