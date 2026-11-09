import { describe, expect, it } from 'vitest'

import { withAbsences } from './record-engagements'

// The record's programme block flags an assignment that falls inside one of the person's planned absences, as the
// home page does. Absences cover whole days, from the first day's start to the last day's end.

const absence = {
  id: 1,
  startDate: new Date('2027-04-06T00:00:00+02:00'),
  endDate: new Date('2027-04-12T23:59:59+02:00'),
}
const at = (iso: string, key = 'part-1') => ({
  key,
  partName: 'Lecture de la Bible',
  eventId: 7,
  eventName: 'Réunion de semaine',
  eventStartDate: new Date(iso),
})

describe('withAbsences', () => {
  it('flags an assignment during an absence, its last day included', () => {
    const [during, lastDay, after] = withAbsences(
      [at('2027-04-09T19:00:00+02:00'), at('2027-04-12T19:00:00+02:00'), at('2027-04-13T19:00:00+02:00')],
      [absence],
    )
    expect([during?.absent, lastDay?.absent, after?.absent]).toEqual([true, true, false])
  })

  it('tells a service slot from a part', () => {
    const [part, service] = withAbsences(
      [at('2027-03-19T19:00:00+01:00'), at('2027-03-26T19:00:00+01:00', 'service-4')],
      [],
    )
    expect([part?.service, service?.service]).toEqual([false, true])
  })

  it('flags nothing when the absences are not to be shown', () => {
    expect(withAbsences([at('2027-04-09T19:00:00+02:00')], null)[0]?.absent).toBe(false)
  })

  it('skips an absence missing one of its ends', () => {
    expect(
      withAbsences([at('2027-04-09T19:00:00+02:00')], [{ id: 2, startDate: null, endDate: null }])[0]?.absent,
    ).toBe(false)
  })
})
