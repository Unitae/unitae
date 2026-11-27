import { describe, expect, it } from 'vitest'

import { countsSeen, mayOpenEvent, maySeeSchedule, schedulePublishAction } from './programme-access'

describe('mayOpenEvent', () => {
  const none = { canEdit: false, canPublish: false, canAssign: false, canAssignService: false }

  it('opens a published programme to every reader', () => {
    expect(mayOpenEvent('released', none)).toBe(true)
  })

  it('opens a draft only to someone who may act on it', () => {
    expect(mayOpenEvent('draft', none)).toBe(false)
    expect(mayOpenEvent('draft', { ...none, canAssignService: true })).toBe(true)
    expect(mayOpenEvent('draft', { ...none, canPublish: true })).toBe(true)
  })
})

describe('maySeeSchedule', () => {
  const none = { canEdit: false, canPublish: false, canAssign: false, canAssignService: false }
  const programme = (status: string) => ({ kind: 'programme', status })
  const duties = (status: string) => ({ kind: 'duty', status })

  it('shows a published schedule to every reader of the programmes', () => {
    expect(maySeeSchedule(programme('published'), none)).toBe(true)
    expect(maySeeSchedule(duties('published'), none)).toBe(true)
  })

  it('hides a draft schedule from a reader who may act on none of it (D45)', () => {
    expect(maySeeSchedule(programme('draft'), none)).toBe(false)
    expect(maySeeSchedule(duties('draft'), none)).toBe(false)
  })

  it('shows a draft schedule to whoever fills that kind, never the other kind', () => {
    expect(maySeeSchedule(programme('draft'), { ...none, canAssign: true })).toBe(true)
    expect(maySeeSchedule(duties('draft'), { ...none, canAssign: true })).toBe(false)
    expect(maySeeSchedule(duties('draft'), { ...none, canAssignService: true })).toBe(true)
    expect(maySeeSchedule(programme('draft'), { ...none, canAssignService: true })).toBe(false)
  })

  it('shows every draft schedule to whoever may change or publish the event', () => {
    for (const rights of [
      { ...none, canEdit: true },
      { ...none, canPublish: true },
    ]) {
      expect(maySeeSchedule(programme('draft'), rights)).toBe(true)
      expect(maySeeSchedule(duties('draft'), rights)).toBe(true)
    }
  })
})

describe('schedulePublishAction', () => {
  it('offers « Publier » only on a publishable draft, « Repasser en brouillon » on a published one the reader may withdraw', () => {
    expect(schedulePublishAction({ status: 'draft', mayPublish: true, publishable: true })).toBe('publish')
    // May publish, but publishing would refuse it (a programme still to give).
    expect(schedulePublishAction({ status: 'draft', mayPublish: true, publishable: false })).toBeNull()
    expect(schedulePublishAction({ status: 'published', mayPublish: true, publishable: false })).toBe('unpublish')
    expect(schedulePublishAction({ status: 'published', mayPublish: false, publishable: false })).toBeNull()
  })
})

// A reader is not counted what they cannot see (user, 2026-11-27): the programmes list adds up the schedules they see.
describe('countsSeen', () => {
  const none = { canEdit: false, canPublish: false, canAssign: false, canAssignService: false }
  const slots = (total: number, filled: number, flagged = 0) => ({ total, filled, flagged })
  const schedules = [
    { id: 1, kind: 'programme', status: 'published', slots: slots(3, 2) },
    { id: 2, kind: 'duty', status: 'published', slots: slots(2, 2) },
    { id: 3, kind: 'duty', status: 'draft', slots: slots(4, 1, 1) },
  ]

  it('counts a plain reader the published schedules only', () => {
    expect(countsSeen(schedules, none, [])).toEqual({ parts: slots(3, 2), services: slots(2, 2) })
  })

  it('counts a duties schedule’s responsible their draft, and not another one’s', () => {
    expect(countsSeen(schedules, none, [3])).toEqual({ parts: slots(3, 2), services: slots(6, 3, 1) })
    const draftProgramme = [{ ...schedules[0], status: 'draft' }, ...schedules.slice(1)]
    expect(countsSeen(draftProgramme, none, [3]).parts).toEqual(slots(0, 0))
  })

  it('counts whoever may change or publish the meeting every schedule', () => {
    expect(countsSeen(schedules, { ...none, canPublish: true }, [])).toEqual({
      parts: slots(3, 2),
      services: slots(6, 3, 1),
    })
  })
})
