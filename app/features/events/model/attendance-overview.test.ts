import { describe, expect, it } from 'vitest'
import { attendanceChart, attendanceMetrics, attendanceMonths, type OverviewMeeting } from './attendance-overview'

const PARIS = 'Europe/Paris'
// Monday 16 November 2026, 10:00 in Paris: service year 2026–2027, its third month.
const NOW = new Date('2026-11-16T09:00:00Z')
const TODAY = '2026-11-16'

let nextId = 1
const meeting = (
  day: string,
  kind: OverviewMeeting['kind'],
  inPerson: number | null,
  online: number | null,
  hour = '18:00',
): OverviewMeeting => ({
  eventId: nextId++,
  name: kind === 'midweek' ? 'Réunion de semaine' : kind === 'weekend' ? 'Réunion du week-end' : 'Mémorial',
  startDate: new Date(`${day}T${hour}:00Z`),
  day,
  kind,
  inPerson,
  online,
})

const year = [
  meeting('2026-09-03', 'midweek', 70, 15),
  meeting('2026-09-06', 'weekend', 100, 12, '08:00'),
  meeting('2026-10-01', 'midweek', 72, 16),
  meeting('2026-10-04', 'weekend', 98, 20, '08:00'),
  // The week of 12 October had no meeting (a circuit assembly).
  meeting('2026-10-22', 'midweek', 74, 14),
  meeting('2026-10-25', 'weekend', 102, 18, '08:00'),
  meeting('2026-11-12', 'midweek', 74, null), // the online count never came
  meeting('2026-11-15', 'weekend', 96, 21, '08:00'),
  // Created ahead by the recurring-events job: not held yet, they count nowhere.
  meeting('2026-11-19', 'midweek', null, null),
  meeting('2026-11-22', 'weekend', null, null, '08:00'),
]
const lastYear = [
  meeting('2025-09-04', 'midweek', 66, 14),
  meeting('2025-11-13', 'midweek', 70, 14),
  meeting('2025-12-04', 'midweek', 90, 10), // after the compared months
  meeting('2025-09-07', 'weekend', 95, 15, '08:00'),
]

describe('attendanceMetrics', () => {
  const metrics = attendanceMetrics({
    meetings: year,
    previous: lastYear,
    serviceYear: 2026,
    today: TODAY,
    now: NOW,
    timeZone: PARIS,
  })

  it('averages the complete meetings of each kind, against the same months last year', () => {
    // (85 + 88 + 88) / 3 = 87, against (80 + 84) / 2 = 82.
    expect(metrics.midweek).toMatchObject({ average: 87, previous: 82 })
    expect(metrics.weekend).toMatchObject({ average: 117, previous: 110 })
    // The change is the exact averages' (261 / 3 against 164 / 2), not the rounded figures'.
    expect(metrics.midweek.change).toBeCloseTo(87 / 82 - 1)
  })

  it('counts the meetings held and those to complete, never one still to come', () => {
    expect(metrics.entered).toEqual({ complete: 7, held: 8, toComplete: 1 })
  })

  it('gives the online share of everyone counted, this year and last', () => {
    expect(metrics.onlineShare.current).toBeCloseTo(116 / 728)
    expect(metrics.onlineShare.previous).toBeCloseTo(43 / 274)
  })
})

describe('attendanceChart', () => {
  it('gives each month its average for the kind and measure, this year over last year', () => {
    const points = attendanceChart({
      meetings: year,
      previous: lastYear,
      serviceYear: 2026,
      kind: 'midweek',
      measure: 'total',
      now: NOW,
    })

    expect(points).toHaveLength(12)
    expect(points.slice(0, 4)).toEqual([
      { month: 8, current: 85, previous: 80, count: 1 },
      { month: 9, current: 88, previous: null, count: 2 },
      // November: the only meeting held is incomplete, the one to come is not held.
      { month: 10, current: null, previous: 84, count: 0 },
      { month: 11, current: null, previous: 100, count: 0 },
    ])
  })

  it('averages one count alone when asked', () => {
    const [september] = attendanceChart({
      meetings: year,
      previous: lastYear,
      serviceYear: 2026,
      kind: 'weekend',
      measure: 'online',
      now: NOW,
    })
    expect(september).toMatchObject({ current: 12, previous: 15 })
  })
})

describe('attendanceMonths', () => {
  const months = attendanceMonths({ meetings: year, now: NOW, timeZone: PARIS, view: 'all' })

  it('lists the months held, the most recent first, each meeting newest first', () => {
    expect(months.map(month => month.month)).toEqual([10, 9, 8])
    const meetings = months[0]?.rows.filter(row => row.type === 'meeting')
    expect(meetings?.map(row => row.type === 'meeting' && row.day)).toEqual(['2026-11-15', '2026-11-12'])
  })

  it('names each meeting’s state: entered, to complete, or under way', () => {
    const states = months[0]?.rows.flatMap(row => (row.type === 'meeting' ? [row.state] : []))
    expect(states).toEqual(['entered', 'todo'])
    const live = attendanceMonths({
      meetings: [meeting('2026-11-16', 'weekend', 90, null, '08:30')],
      now: NOW,
      timeZone: PARIS,
      view: 'all',
    })
    expect(live[0]?.rows[0]).toMatchObject({ type: 'meeting', state: 'live' })
  })

  it('shows a week without a meeting as such, in its month', () => {
    const october = months.find(month => month.month === 9)
    expect(october?.rows).toContainEqual({ type: 'off', monday: '2026-10-12', kind: 'midweek' })
    expect(october?.rows).toContainEqual({ type: 'off', monday: '2026-10-12', kind: 'weekend' })
    // Never after the last meeting held: the weeks ahead are not « no meeting ».
    expect(months[0]?.rows.some(row => row.type === 'off' && row.monday > '2026-11-15')).toBe(false)
  })

  it('gives each month its averages', () => {
    expect(months.find(month => month.month === 9)).toMatchObject({ midweek: 88, weekend: 119 })
  })

  it('keeps only the meetings to complete, or only those counted apart', () => {
    const todo = attendanceMonths({ meetings: year, now: NOW, timeZone: PARIS, view: 'todo' })
    expect(todo.flatMap(month => month.rows)).toEqual([expect.objectContaining({ day: '2026-11-12', state: 'todo' })])

    // An incomplete Memorial is not « à compléter »: the averages do not wait for it, as the figure says.
    const halfMemorial = meeting('2026-04-02', 'separate', 181, null)
    const withMemorial = attendanceMonths({
      meetings: [...year, halfMemorial],
      now: NOW,
      timeZone: PARIS,
      view: 'todo',
    })
    expect(withMemorial.flatMap(month => month.rows)).toHaveLength(1)

    const memorial = meeting('2026-04-02', 'separate', 181, 43)
    const apart = attendanceMonths({ meetings: [...year, memorial], now: NOW, timeZone: PARIS, view: 'apart' })
    expect(apart.flatMap(month => month.rows)).toEqual([expect.objectContaining({ eventId: memorial.eventId })])
  })
})
