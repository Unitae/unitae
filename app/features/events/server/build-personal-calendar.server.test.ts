import { describe, expect, it } from 'vitest'
import { buildPersonalCalendarIcs } from './build-personal-calendar.server'
import type { PersonalCalendarItem } from './personal-assignments.server'

const ALL_DAY_DTSTART = /DTSTART;VALUE=DATE:20260412/
const ALL_DAY_DTEND = /DTEND;VALUE=DATE:20260413/
const TIMED_DTSTART = /DTSTART:20260410T180000Z/
const TIMED_DTEND = /DTEND:20260410T200000Z/
const VEVENT_BEGIN = /BEGIN:VEVENT/g

const sampleItems: PersonalCalendarItem[] = [
  {
    uid: 'programme-part-assignee-10',
    kind: 'programme-part',
    summary: 'Présentateur — Réunion · Trésors',
    description: 'Présentateur — Section 1',
    start: new Date('2026-04-10T18:00:00Z'),
    end: new Date('2026-04-10T20:00:00Z'),
    allDay: false,
    updatedAt: new Date('2026-04-01T00:00:00Z'),
  },
  {
    uid: 'day-off-3',
    kind: 'day-off',
    summary: 'Absence',
    description: '',
    start: new Date('2026-04-12T00:00:00Z'),
    end: new Date('2026-04-13T00:00:00Z'),
    allDay: true,
    updatedAt: new Date('2026-04-05T00:00:00Z'),
  },
]

describe('buildPersonalCalendarIcs', () => {
  it('produces a valid iCalendar header', () => {
    const ics = buildPersonalCalendarIcs({ items: [], userLabel: 'Jean', uidDomain: 'unitae.test' })

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('METHOD:PUBLISH')
    expect(ics).toContain('PRODID:')
    expect(ics).toContain('Unitae')
  })

  it('renders one VEVENT per item with stable UIDs scoped by domain', () => {
    const ics = buildPersonalCalendarIcs({
      items: sampleItems,
      userLabel: 'Jean',
      uidDomain: 'unitae.test',
    })

    const eventCount = ics.match(VEVENT_BEGIN)?.length ?? 0
    expect(eventCount).toBe(2)
    expect(ics).toContain('UID:programme-part-assignee-10@unitae.test')
    expect(ics).toContain('UID:day-off-3@unitae.test')
  })

  it('emits all-day events as VALUE=DATE', () => {
    const ics = buildPersonalCalendarIcs({
      items: [sampleItems[1]],
      userLabel: 'Jean',
      uidDomain: 'unitae.test',
    })

    expect(ics).toMatch(ALL_DAY_DTSTART)
    expect(ics).toMatch(ALL_DAY_DTEND)
  })

  it('emits timed events with full datetime', () => {
    const ics = buildPersonalCalendarIcs({
      items: [sampleItems[0]],
      userLabel: 'Jean',
      uidDomain: 'unitae.test',
    })

    expect(ics).toMatch(TIMED_DTSTART)
    expect(ics).toMatch(TIMED_DTEND)
  })

  it('escapes special characters in summary and description', () => {
    const ics = buildPersonalCalendarIcs({
      items: [
        {
          uid: 'programme-part-assignee-1',
          kind: 'programme-part',
          summary: 'Title with, comma; and: colons',
          description: 'Multi\nline\ndescription',
          start: new Date('2026-04-10T18:00:00Z'),
          end: new Date('2026-04-10T20:00:00Z'),
          allDay: false,
          updatedAt: new Date('2026-04-01T00:00:00Z'),
        },
      ],
      userLabel: 'Jean',
      uidDomain: 'unitae.test',
    })

    expect(ics).toContain('Title with\\, comma\\; and: colons')
    expect(ics).toContain('Multi\\nline\\ndescription')
  })
})
