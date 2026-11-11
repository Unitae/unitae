import { describe, expect, it } from 'vitest'
import { organigramIntentSchema } from './organigram.schema'

function parse(fields: Record<string, string>) {
  return organigramIntentSchema.safeParse(fields)
}

describe('organigram intents', () => {
  it('reads a role attached under another, or put back at the top', () => {
    const under = parse({ intent: 'add', roleId: '3', parentRoleId: '4' })
    expect(under.success && under.data).toEqual({ intent: 'add', roleId: 3, parentRoleId: 4 })
    const top = parse({ intent: 'add', roleId: '3', parentRoleId: 'none' })
    expect(top.success && top.data).toEqual({ intent: 'add', roleId: 3, parentRoleId: null })
  })

  it('reads a new role, outside the chart when no place is chosen, a team unless marked personal', () => {
    const created = parse({ intent: 'create', name: ' Lecteurs ', parentRoleId: 'none' })
    expect(created.success && created.data).toEqual({
      intent: 'create',
      name: 'Lecteurs',
      parentRoleId: null,
      singlePerson: false,
      description: '',
    })
    const personal = parse({ intent: 'create', name: 'Comptes', parentRoleId: '4', singlePerson: 'on' })
    expect(personal.success && personal.data).toMatchObject({ parentRoleId: 4, singlePerson: true })
  })

  it('refuses a role without a name', () => {
    expect(parse({ intent: 'create', name: '   ' }).success).toBe(false)
    expect(parse({ intent: 'update', roleId: '3', name: '' }).success).toBe(false)
  })

  it('reads a role’s definition, its note included', () => {
    const updated = parse({
      intent: 'update',
      roleId: '3',
      name: 'Sono',
      note: ' Chaque réunion ',
      singlePerson: 'off',
    })
    expect(updated.success && updated.data).toEqual({
      intent: 'update',
      roleId: 3,
      name: 'Sono',
      description: '',
      note: 'Chaque réunion',
      singlePerson: false,
    })
  })

  it('reads a seat', () => {
    expect(parse({ intent: 'seat', roleId: '3', memberId: '9', kind: 'leader' }).success).toBe(true)
    expect(parse({ intent: 'seat', roleId: '3', memberId: '9', kind: 'boss' }).success).toBe(false)
  })
})
