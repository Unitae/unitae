import { describe, expect, it } from 'vitest'

import { mayOpenEvent } from './programme-access'

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
