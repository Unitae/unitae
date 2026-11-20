import { describe, expect, it } from 'vitest'
import { demoHelpLimit } from './demo-help'

describe('demoHelpLimit', () => {
  it('says a task a demo copy refuses is not available', () => {
    for (const slug of [
      'password',
      'two-step-verification',
      'reset-two-step',
      'invite-user',
      'congregation-data',
      'board-add-pdf',
    ]) {
      expect(demoHelpLimit(slug)).toBe('unavailable')
    }
  })

  it('says which part of a task the copy refuses', () => {
    expect(demoHelpLimit('board-versions')).toBe('no-upload')
    expect(demoHelpLimit('external-speakers')).toBe('no-upload-no-send')
    expect(demoHelpLimit('give-rights')).toBe('no-account-page')
    expect(demoHelpLimit('notifications')).toBe('no-email')
  })

  it('says nothing of a task that works in the demo', () => {
    expect(demoHelpLimit('territory-attributions')).toBeNull()
    expect(demoHelpLimit('unknown-slug')).toBeNull()
  })
})
