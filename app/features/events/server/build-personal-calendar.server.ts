import ical, { ICalCalendarMethod } from 'ical-generator'
import type { PersonalCalendarItem } from '~/features/events/server/personal-assignments.server'
import * as m from '~/i18n/paraglide/messages'

const PRODID = { company: 'Unitae', product: 'Personal Calendar', language: 'FR' }

export type BuildPersonalCalendarInput = {
  items: PersonalCalendarItem[]
  userLabel: string
  uidDomain: string
}

export function buildPersonalCalendarIcs({ items, userLabel, uidDomain }: BuildPersonalCalendarInput): string {
  const calendar = ical({
    prodId: PRODID,
    name: m.calendar_feed_calendar_title({ name: userLabel }),
    method: ICalCalendarMethod.PUBLISH,
  })

  for (const item of items) {
    calendar.createEvent({
      id: `${item.uid}@${uidDomain}`,
      summary: item.summary,
      description: item.description || undefined,
      start: item.start,
      end: item.end,
      allDay: item.allDay,
      lastModified: item.updatedAt,
      sequence: Math.floor(item.updatedAt.getTime() / 1000),
    })
  }

  return calendar.toString()
}
