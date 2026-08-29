import { describe, expect, it } from 'vitest'
import { organigramIntentSchema } from './organigram.schema'

function parse(fields: Record<string, string>) {
  return organigramIntentSchema.safeParse(fields)
}

describe('organigram intents', () => {
  it('accepts creating a service under a parent', () => {
    // Creating and attaching in one submit: the alternative is a trip to the roles page and back,
    // ~15 times while building a first chart.
    const result = parse({ intent: 'create', name: 'Comité de service', parentRoleId: '4' })

    expect(result.success).toBe(true)
    if (result.success && result.data.intent === 'create') {
      expect(result.data.name).toBe('Comité de service')
      expect(result.data.parentRoleId).toBe(4)
    }
  })

  it('accepts creating a service at the top of the chart', () => {
    const result = parse({ intent: 'create', name: 'Nettoyage', parentRoleId: 'none' })

    expect(result.success).toBe(true)
    if (result.success && result.data.intent === 'create') expect(result.data.parentRoleId).toBeNull()
  })

  it('rejects an empty or blank name', () => {
    expect(parse({ intent: 'create', name: '', parentRoleId: 'none' }).success).toBe(false)
    expect(parse({ intent: 'create', name: '   ', parentRoleId: 'none' }).success).toBe(false)
  })

  it('still accepts the existing intents', () => {
    expect(parse({ intent: 'add', roleId: '3', parentRoleId: 'none' }).success).toBe(true)
    expect(parse({ intent: 'seat', roleId: '3', memberId: '9', kind: 'leader' }).success).toBe(true)
  })
})
