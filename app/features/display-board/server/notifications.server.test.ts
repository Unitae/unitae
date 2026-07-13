import { describe, expect, it } from 'vitest'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { boardNotifications } from './notifications.server'

const CONGREGATION: CongregationInfo = {
  id: 1,
  name: 'Test',
  slug: 'test',
  locale: 'en',
  timezone: 'UTC',
  displayName: 'Test Assembly',
  emailFrom: 'noreply@test.org',
  baseUrl: 'https://test.org',
  plan: null,
  maxPublishers: null,
  maxTerritories: null,
  maxUsers: null,
} as CongregationInfo

const RECIPIENT = { email: 'r@test.org', firstname: 'Jean' }

const EXPECTED_TYPES = [
  'board.document.created',
  'board.document.updated',
  'board.document.deleted',
  'board.document.expiring',
]

describe('boardNotifications', () => {
  it('registers every board.document.* type', () => {
    const registered = new Set(boardNotifications.map(d => d.type))
    for (const type of EXPECTED_TYPES) {
      expect(registered.has(type), `${type} should be registered`).toBe(true)
    }
  })

  it('every definition ships an example that parses against its schema', () => {
    for (const def of boardNotifications) {
      const result = def.payload.safeParse(def.example)
      expect(result.success, `${def.type} example must parse`).toBe(true)
    }
  })

  it('every definition renders a truthy React element for its example', () => {
    for (const def of boardNotifications) {
      const react = def.renderEmail({ payload: def.example, recipient: RECIPIENT, congregation: CONGREGATION })
      expect(react, `${def.type} renderEmail must return a React element`).toBeTruthy()
    }
  })

  it('every definition supplies a non-empty subject for its example', () => {
    for (const def of boardNotifications) {
      expect(def.subject(def.example), `${def.type} subject must be non-empty`).toBeTruthy()
    }
  })
})
