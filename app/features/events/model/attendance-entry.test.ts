import { describe, expect, it } from 'vitest'
import { countField, entryProgress } from './attendance-entry'

const PARIS = 'Europe/Paris'
// Sunday 15 November 2026, the weekend meeting started at 10:00 in Paris.
const meeting = {
  eventId: 40,
  name: 'Réunion du week-end',
  startDate: new Date('2026-11-15T09:00:00Z'),
  inPerson: 98,
  inPersonAt: new Date('2026-11-15T09:41:00Z'),
  inPersonBy: 'Paul MARTIN',
  inPersonById: 7,
  online: null,
  onlineAt: null,
  onlineBy: null,
  onlineById: null,
}
const usher = { actorId: 8, canRecord: true, canCorrect: false, timeZone: PARIS, now: new Date('2026-11-15T09:50:00Z') }

describe('countField', () => {
  it('lets a recorder fill an empty count during the meeting', () => {
    expect(countField(meeting, 'online', usher)).toEqual({
      value: null,
      by: null,
      at: null,
      mine: false,
      editable: true,
    })
  })

  // §6.3: a count someone else entered is read-only for a recorder, and theirs for its author.
  it('shows a recorder someone else’s count read-only, and lets its author change it', () => {
    expect(countField(meeting, 'inPerson', usher)).toMatchObject({ value: 98, by: 'Paul MARTIN', editable: false })
    expect(countField(meeting, 'inPerson', { ...usher, actorId: 7 })).toMatchObject({ mine: true, editable: true })
  })

  it('lets a corrector change any count', () => {
    expect(countField(meeting, 'inPerson', { ...usher, canRecord: false, canCorrect: true }).editable).toBe(true)
  })

  it('closes a recorder’s entry at midnight', () => {
    const late = { ...usher, now: new Date('2026-11-15T23:30:00Z') }
    expect(countField(meeting, 'online', late).editable).toBe(false)
  })
})

describe('entryProgress', () => {
  it('counts the numbers entered and gives the total once both are there', () => {
    expect(entryProgress(meeting)).toEqual({ entered: 1, total: null })
    expect(entryProgress({ ...meeting, online: 21 })).toEqual({ entered: 2, total: 119 })
    expect(entryProgress({ ...meeting, inPerson: null })).toEqual({ entered: 0, total: null })
  })
})
