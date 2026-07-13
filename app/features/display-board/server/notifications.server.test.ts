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

  // Guards against a renderer that ignores its payload — the schema-parse
  // test would still pass and the "renders truthy" test only asserts a React
  // element is returned. Asserting a payload-derived string in the outgoing
  // props ties output back to input.
  it('every definition threads a payload-derived value into the outgoing template props', () => {
    const expectedTitles: Record<string, string> = {
      'board.document.created': 'Sample doc',
      'board.document.updated': 'Sample doc',
      'board.document.deleted': 'Sample doc',
      'board.document.expiring': 'Sample doc',
    }
    for (const def of boardNotifications) {
      const react = def.renderEmail({
        payload: def.example,
        recipient: RECIPIENT,
        congregation: CONGREGATION,
      }) as { props: Record<string, unknown> } | null
      expect(react, `${def.type} must render`).toBeTruthy()
      const propsJson = JSON.stringify(react?.props ?? {})
      const expectedTitle = expectedTitles[def.type]
      expect(
        propsJson.includes(expectedTitle),
        `${def.type} render did not include payload-derived title '${expectedTitle}'`,
      ).toBe(true)
    }
  })
})
