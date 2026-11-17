import { describe, expect, it } from 'vitest'
import { countField, countsToSend, entryProgress } from './attendance-entry'

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

describe('countsToSend', () => {
  const open = { editable: true }
  const closed = { editable: false }

  it('sends each count typed in an editable field, empty meaning cleared', () => {
    expect(countsToSend({ inPerson: '98', online: '' }, { inPerson: open, online: open })).toEqual({
      counts: { inPerson: 98, online: null },
      invalid: [],
    })
  })

  // A field that became read-only (someone else entered it first) keeps no typed number to send again.
  it('never sends a field the viewer may no longer change', () => {
    expect(countsToSend({ inPerson: '87', online: '21' }, { inPerson: closed, online: open })).toEqual({
      counts: { online: 21 },
      invalid: [],
    })
  })

  // The other field still goes: one wrong number never holds back the other.
  it('names a number that is not a count and sends the other field', () => {
    expect(countsToSend({ inPerson: '-3', online: '21' }, { inPerson: open, online: open })).toEqual({
      counts: { online: 21 },
      invalid: ['inPerson'],
    })
    expect(countsToSend({ inPerson: '1.5' }, { inPerson: open, online: open }).invalid).toEqual(['inPerson'])
    expect(countsToSend({ inPerson: '250000' }, { inPerson: open, online: open }).invalid).toEqual(['inPerson'])
  })

  // Typed text that is not a number must never read as « cleared » and erase a stored count.
  it('takes only plain digits as a count: anything else is named, never cleared', () => {
    for (const text of ['85 pers.', '~85', '85,', '1e', '0x10', '+3']) {
      expect(countsToSend({ inPerson: text }, { inPerson: open, online: open })).toEqual({
        counts: {},
        invalid: ['inPerson'],
      })
    }
    expect(countsToSend({ inPerson: ' 85 ' }, { inPerson: open, online: open }).counts).toEqual({ inPerson: 85 })
  })
})
