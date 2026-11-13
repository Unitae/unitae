import { describe, expect, it } from 'vitest'
import { auditEntityLabel } from './audit-entities'

describe('auditEntityLabel', () => {
  it('names the object when its name is known', () => {
    expect(auditEntityLabel('Role', 12, 'Chariots')).toBe('Rôle · Chariots')
  })

  it('keeps the number for an object whose name is not known', () => {
    expect(auditEntityLabel('Role', 12, null)).toBe('Rôle #12')
    expect(auditEntityLabel('Role', 12)).toBe('Rôle #12')
  })

  it('needs no number for the congregation and shows a dash for a row about nothing', () => {
    expect(auditEntityLabel('Congregation', 3, 'Les Lilas')).toBe('Assemblée')
    expect(auditEntityLabel(null, null)).toBe('—')
  })
})
