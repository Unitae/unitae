import { describe, expect, it } from 'vitest'

import { meetingForViewer } from './meeting-visibility'

const meeting = {
  name: 'Réunion de semaine',
  eventParts: [
    { id: 10, name: 'Discours', hasConflict: false },
    { id: 11, name: 'Étude', hasConflict: true },
  ],
  eventServiceParts: [
    { id: 20, name: 'Sono' },
    { id: 21, name: 'Accueil' },
  ],
  userPartIds: [10],
  userServicePartIds: [20],
}

describe('meetingForViewer', () => {
  it('hands the full schedule and its conflicts to whoever may act on the meeting', () => {
    expect(meetingForViewer(meeting, { schedule: true, conflicts: true })).toEqual(meeting)
  })

  it('hands board readers the schedule without the absence flags, which the board never shows', () => {
    const visible = meetingForViewer(meeting, { schedule: true, conflicts: false })
    expect(visible.eventParts.map(p => p.id)).toEqual([10, 11])
    expect(visible.eventParts.every(p => p.hasConflict === false)).toBe(true)
    expect(visible.eventServiceParts.map(p => p.id)).toEqual([20, 21])
  })

  it('keeps only their own parts for someone who may read the schedule nowhere', () => {
    const visible = meetingForViewer(meeting, { schedule: false, conflicts: false })
    expect(visible.eventParts.map(p => p.id)).toEqual([10])
    expect(visible.eventServiceParts.map(p => p.id)).toEqual([20])
    expect(visible.userPartIds).toEqual([10])
  })
})
