import { describe, expect, it } from 'vitest'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { territoryNotifications } from './notifications.server'

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

const EXPECTED_TYPES = ['territory.sync.completed']

describe('territoryNotifications', () => {
  it('registers every expected territory type', () => {
    const registered = new Set(territoryNotifications.map(d => d.type))
    for (const type of EXPECTED_TYPES) {
      expect(registered.has(type), `${type} should be registered`).toBe(true)
    }
  })

  it('registers territory.sync.completed', () => {
    const def = territoryNotifications.find(d => d.type === 'territory.sync.completed')
    expect(def).toBeDefined()
  })

  it('every definition ships an example that parses against its schema', () => {
    for (const def of territoryNotifications) {
      const result = def.payload.safeParse(def.example)
      expect(result.success, `${def.type} example must parse`).toBe(true)
    }
  })

  it('every definition renders a truthy React element for its example', () => {
    for (const def of territoryNotifications) {
      const react = def.renderEmail({ payload: def.example, recipient: RECIPIENT, congregation: CONGREGATION })
      expect(react, `${def.type} renderEmail must return a React element`).toBeTruthy()
    }
  })

  it('every definition supplies a non-empty subject for its example', () => {
    for (const def of territoryNotifications) {
      expect(def.subject(def.example), `${def.type} subject must be non-empty`).toBeTruthy()
    }
  })
})
