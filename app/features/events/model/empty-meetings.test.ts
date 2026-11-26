import { describe, expect, it } from 'vitest'
import { dayInSameWeek, isAwaitingProgramme, planMeetingMoves, programmeAwaits } from './empty-meetings'

describe('dayInSameWeek', () => {
  // Weeks run Monday to Sunday: a weekend meeting moved from Saturday to Sunday stays in its week.
  it('moves Saturday to the Sunday after it, never the one before', () => {
    expect(dayInSameWeek('2026-11-21', 0)).toBe('2026-11-22')
  })

  it('moves Sunday to the Saturday before it', () => {
    expect(dayInSameWeek('2026-11-22', 6)).toBe('2026-11-21')
  })

  it('moves Tuesday to the Thursday of the same week, and keeps a day already right', () => {
    expect(dayInSameWeek('2026-11-17', 4)).toBe('2026-11-19')
    expect(dayInSameWeek('2026-11-19', 4)).toBe('2026-11-19')
  })

  it('moves Thursday back to the Monday of its week', () => {
    expect(dayInSameWeek('2026-11-19', 1)).toBe('2026-11-16')
  })
})

describe('isAwaitingProgramme', () => {
  const midweek = { key: 'midweek-meeting', parts: 12, services: 4 }

  it('is a meeting of a template with a programme to give, with neither parts nor services yet', () => {
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: midweek })).toBe(true)
    // A template the congregation made itself has no key; services alone are a programme to give.
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: { key: null, parts: 0, services: 2 } })).toBe(true)
  })

  it('is not a meeting with a part or a service', () => {
    expect(isAwaitingProgramme({ parts: 1, services: 0, template: midweek })).toBe(false)
    expect(isAwaitingProgramme({ parts: 0, services: 2, template: midweek })).toBe(false)
  })

  // A template that only puts an event on the calendar has nothing to wait for: its events are published as they are.
  it('is not an event of a template with neither parts nor services', () => {
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: { key: null, parts: 0, services: 0 } })).toBe(false)
  })

  // « Autre évènement » has no programme to wait for: empty, it is still an event that can be published.
  it('is never another event', () => {
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: { ...midweek, key: 'freeform' } })).toBe(false)
  })

  it('is not an event without a template', () => {
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: null })).toBe(false)
  })
})

describe('planMeetingMoves', () => {
  const PARIS = 'Europe/Paris'
  // Monday 16 November 2026, 10:00 in Paris.
  const NOW = new Date('2026-11-16T09:00:00Z')
  // Created on the seeded Tuesday at 19:00; the template now says Thursday 19:30–21:15.
  const tuesday = (id: number, day: string) => ({
    id,
    startDate: new Date(`${day}T18:00:00Z`),
    endDate: new Date(`${day}T19:45:00Z`),
  })
  const rule = { weekDay: 4, startTime: '19:30', endTime: '21:15', timeZone: PARIS, now: NOW }

  it('moves each meeting to the template’s day of its own week, at the template’s hours', () => {
    const plan = planMeetingMoves({
      ...rule,
      meetings: [tuesday(1, '2026-11-17'), tuesday(2, '2026-11-24')],
      taken: [],
    })

    expect(plan.move).toEqual([
      { id: 1, startDate: new Date('2026-11-19T18:30:00Z'), endDate: new Date('2026-11-19T20:15:00Z') },
      { id: 2, startDate: new Date('2026-11-26T18:30:00Z'), endDate: new Date('2026-11-26T20:15:00Z') },
    ])
    expect(plan.remove).toEqual([])
  })

  // The week already has its meeting (a programme created on the new day): the empty one is redundant.
  it('deletes a meeting whose week already has one on the new day', () => {
    const plan = planMeetingMoves({ ...rule, meetings: [tuesday(1, '2026-11-17')], taken: ['2026-11-19'] })

    expect(plan).toEqual({ move: [], remove: [1] })
  })

  it('leaves alone a meeting already at the right day and hours, and lets it hold its day', () => {
    const inPlace = { id: 3, startDate: new Date('2026-11-19T18:30:00Z'), endDate: new Date('2026-11-19T20:15:00Z') }

    const plan = planMeetingMoves({ ...rule, meetings: [tuesday(1, '2026-11-17'), inPlace], taken: [] })

    expect(plan).toEqual({ move: [], remove: [1] })
  })

  it('never moves a meeting to an hour already past', () => {
    // The template moves to Monday: this week's Monday at 19:30 is still ahead, but at 08:00 it is gone.
    const early = { ...rule, weekDay: 1, startTime: '08:00', endTime: '09:00' }

    expect(planMeetingMoves({ ...early, meetings: [tuesday(1, '2026-11-17')], taken: [] })).toEqual({
      move: [],
      remove: [],
    })
  })

  // Clocks go back on Sunday 25 October 2026: 10:00 in Paris is 08:00 UTC on the Saturday, 09:00 UTC on the Sunday.
  it('keeps the local hour across a change of time', () => {
    const saturday = { id: 1, startDate: new Date('2026-10-24T08:00:00Z'), endDate: new Date('2026-10-24T09:45:00Z') }
    const sunday = {
      weekDay: 0,
      startTime: '10:00',
      endTime: '11:45',
      timeZone: PARIS,
      now: new Date('2026-10-19T09:00:00Z'),
    }

    expect(planMeetingMoves({ ...sunday, meetings: [saturday], taken: [] }).move).toEqual([
      { id: 1, startDate: new Date('2026-10-25T09:00:00Z'), endDate: new Date('2026-10-25T10:45:00Z') },
    ])
  })

  it('plans nothing for a template that no longer has a day', () => {
    expect(planMeetingMoves({ ...rule, weekDay: null, meetings: [tuesday(1, '2026-11-17')], taken: [] })).toEqual({
      move: [],
      remove: [],
    })
  })
})

describe('programmeAwaits', () => {
  const midweek = {
    key: 'midweek-meeting',
    scheduleTemplates: [{ scheduleTemplate: { _count: { parts: 12, serviceParts: 4 } } }],
  }
  it('says a programme without parts awaits its own while its template has parts to give', () => {
    expect(programmeAwaits({ kind: 'programme', items: 0, fromTemplate: true }, midweek)).toBe(true)
    expect(programmeAwaits({ kind: 'programme', items: 3, fromTemplate: true }, midweek)).toBe(false)
  })

  it('never says so of duties, nor of a programme whose template gives duties alone or nothing', () => {
    expect(programmeAwaits({ kind: 'duty', items: 0, fromTemplate: true }, midweek)).toBe(false)
    expect(
      programmeAwaits(
        { kind: 'programme', items: 0, fromTemplate: true },
        { key: 'x', scheduleTemplates: [{ scheduleTemplate: { _count: { parts: 0, serviceParts: 4 } } }] },
      ),
    ).toBe(false)
    expect(programmeAwaits({ kind: 'programme', items: 0, fromTemplate: true }, null)).toBe(false)
    // Added empty by hand: nothing of the template's to wait for.
    expect(programmeAwaits({ kind: 'programme', items: 0, fromTemplate: false }, midweek)).toBe(false)
  })
})
