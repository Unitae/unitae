import { describe, expect, it } from 'vitest'

import { mayOpenEvent, maySeeSchedule } from './programme-access'

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
