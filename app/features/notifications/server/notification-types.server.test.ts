import { describe, expect, it } from 'vitest'
import { isCancellationType } from '../model/notification-event.type'
import { NOTIFICATION_TYPES } from './notification-types.server'

describe('NOTIFICATION_TYPES config', () => {
  it('has a config for every board.document.* event that notify() may emit', () => {
    expect(NOTIFICATION_TYPES['board.document.created']).toBeDefined()
    expect(NOTIFICATION_TYPES['board.document.deleted']).toBeDefined()
  })

  it('board.document.created is a debounced type routed to the board-validator role', () => {
    const config = NOTIFICATION_TYPES['board.document.created']
    expect(isCancellationType(config)).toBe(false)
    if (isCancellationType(config)) return // narrow for TS
    expect(config.debounceMinutes).toBeGreaterThan(0)
    expect(config.recipientStrategy).toBe('role')
    expect(config.recipientRole).toBe('board-validator')
  })

  it('board.document.deleted cancels its create/update siblings', () => {
    const config = NOTIFICATION_TYPES['board.document.deleted']
    expect(isCancellationType(config)).toBe(true)
    if (!isCancellationType(config)) return
    expect(config.cancels).toContain('board.document.created')
  })

  it('board.document.deleted defines a fallback used when there is nothing to cancel', () => {
    const config = NOTIFICATION_TYPES['board.document.deleted']
    if (!isCancellationType(config)) throw new Error('expected cancellation type')
    expect(config.fallback).toBeDefined()
    expect(config.fallback.recipientStrategy).toBe('role')
    expect(config.fallback.recipientRole).toBe('board-validator')
  })

  it('every debounced entry sets recipientStrategy and either recipientRole or entity-* strategy', () => {
    for (const [key, config] of Object.entries(NOTIFICATION_TYPES)) {
      if (isCancellationType(config)) continue
      expect(config.recipientStrategy, `${key} missing recipientStrategy`).toBeDefined()
      if (config.recipientStrategy === 'role') {
        expect(config.recipientRole, `${key} declares 'role' but has no recipientRole`).toBeDefined()
      }
    }
  })
})
