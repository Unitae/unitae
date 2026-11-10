import { describe, expect, it } from 'vitest'
import {
  byWeek,
  type CreationTemplate,
  countSeries,
  monthEnd,
  plannedSeries,
  seriesEnds,
  seriesStart,
} from './programme-creation'

const MIDWEEK: CreationTemplate = {
  id: 270,
  name: 'Réunion de semaine',
  color: '#3b82f6',
  weekDay: 4,
  startTime: '19:00',
  endTime: '20:45',
  parts: 15,
  services: 4,
  lastDay: '2026-12-31',
}
const WEEKEND: CreationTemplate = {
  ...MIDWEEK,
  id: 271,
  name: 'Réunion du week-end',
  weekDay: 0,
  startTime: '10:00',
  lastDay: '2026-12-27',
}
const MEMORIAL: CreationTemplate = { ...MIDWEEK, id: 272, name: 'Mémorial', weekDay: null, lastDay: null }

describe('seriesStart', () => {
  it('picks up the day after the earliest last programme of the templates', () => {
    expect(seriesStart([MIDWEEK, WEEKEND], '2026-11-10')).toBe('2026-12-28')
  })

  it('starts today for a template without a programme to come', () => {
    expect(seriesStart([MIDWEEK, { ...WEEKEND, lastDay: '2026-10-04' }], '2026-11-10')).toBe('2026-11-10')
    expect(seriesStart([{ ...MIDWEEK, lastDay: null }], '2026-11-10')).toBe('2026-11-10')
  })

  it('starts today when no template is chosen', () => {
    expect(seriesStart([], '2026-11-10')).toBe('2026-11-10')
  })
})

describe('monthEnd and seriesEnds', () => {
  it('ends a month on its last day, February included', () => {
    expect(monthEnd('2026-12-28', 2)).toBe('2027-02-28')
    expect(monthEnd('2027-12-15', 2)).toBe('2028-02-29')
  })

  it('offers the end of the first, second, third and sixth month after the start', () => {
    expect(seriesEnds('2026-12-28')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-06-30'])
  })
})

describe('plannedSeries', () => {
  it('lists each regular template on its weekday, by day, marking the programmes that exist', () => {
    const planned = plannedSeries([MIDWEEK, WEEKEND, MEMORIAL], '2026-12-28', '2027-01-10', [
      { templateId: 270, day: '2026-12-31', eventId: 4016 },
      { templateId: 271, day: '2026-12-31', eventId: 4999 },
    ])

    expect(planned.map(row => [row.template.id, row.day, row.existingId])).toEqual([
      [270, '2026-12-31', 4016],
      [271, '2027-01-03', null],
      [270, '2027-01-07', null],
      [271, '2027-01-10', null],
    ])
    expect(planned[1]?.key).toBe('271:2027-01-03')
  })

  it('puts two programmes of the same day in the order of their hours', () => {
    const saturday = { ...WEEKEND, id: 273, weekDay: 4, startTime: '09:00' }
    const planned = plannedSeries([MIDWEEK, saturday], '2026-11-12', '2026-11-12', [])

    expect(planned.map(row => row.template.id)).toEqual([273, 270])
  })
})

describe('countSeries', () => {
  it('counts what will be created, what exists and what was passed', () => {
    const planned = plannedSeries([MIDWEEK, WEEKEND], '2026-12-28', '2027-01-10', [
      { templateId: 270, day: '2026-12-31', eventId: 4016 },
    ])

    expect(countSeries(planned, new Set(['271:2027-01-10', '270:2026-12-31']))).toEqual({
      create: 2,
      existing: 1,
      skipped: 1,
    })
  })
})

describe('byWeek', () => {
  it('groups rows under the Monday of their week, Sunday closing it', () => {
    const rows = [{ day: '2026-12-31' }, { day: '2027-01-03' }, { day: '2027-01-07' }]

    expect(byWeek(rows)).toEqual([
      { monday: '2026-12-28', rows: [{ day: '2026-12-31' }, { day: '2027-01-03' }] },
      { monday: '2027-01-04', rows: [{ day: '2027-01-07' }] },
    ])
  })
})
