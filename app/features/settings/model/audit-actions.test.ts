import { describe, expect, it } from 'vitest'
import { AuditAction } from '~/shared/domain/audit.server'
import { AUDIT_ACTIONS, auditActionLabel } from './audit-actions'

describe('AUDIT_ACTIONS', () => {
  // An action without an entry shows its raw key in the log and cannot be filtered: adding one fails here first.
  it('names every action the app records', () => {
    const named = new Set(AUDIT_ACTIONS.map(entry => entry.action))
    expect(Object.values(AuditAction).filter(action => !named.has(action))).toEqual([])
  })

  it('lists each action once', () => {
    const actions = AUDIT_ACTIONS.map(entry => entry.action)
    expect(new Set(actions).size).toBe(actions.length)
  })
})

describe('auditActionLabel', () => {
  it('names an action in words', () => {
    expect(auditActionLabel('user.login')).toBe('Connexion')
  })

  it('falls back on the key of an action the app no longer records', () => {
    expect(auditActionLabel('legacy.thing')).toBe('legacy.thing')
  })
})
