import { describe, expect, it } from 'vitest'
import { organigramIntentSchema } from './organigram.schema'

function parse(fields: Record<string, string>) {
  return organigramIntentSchema.safeParse(fields)
}

describe('organigram intents', () => {
  it('reads an attach with an existing service picked', () => {
    const result = parse({ intent: 'attach', roleId: '3', name: '', parentRoleId: '4' })

    expect(result.success).toBe(true)
    if (result.success && result.data.intent === 'attach') {
      expect(result.data.roleId).toBe(3)
      expect(result.data.name).toBe('')
      expect(result.data.parentRoleId).toBe(4)
    }
  })

  it('reads an attach with a new name typed and nothing picked', () => {
    // One form, no mode radio: the action creates when a name was typed, adds when a service
    // was picked. The schema just delivers both fields honestly.
    const result = parse({ intent: 'attach', roleId: '', name: 'Nettoyage', parentRoleId: 'none' })

    expect(result.success).toBe(true)
    if (result.success && result.data.intent === 'attach') {
      expect(result.data.roleId).toBeNull()
      expect(result.data.name).toBe('Nettoyage')
      expect(result.data.parentRoleId).toBeNull()
    }
  })

  it('parses an attach with neither field filled — the action owns that refusal', () => {
    const result = parse({ intent: 'attach', roleId: '', name: '  ', parentRoleId: '4' })

    expect(result.success).toBe(true)
    if (result.success && result.data.intent === 'attach') {
      expect(result.data.roleId).toBeNull()
      expect(result.data.name).toBe('')
    }
  })

  it('still accepts the existing intents', () => {
    expect(parse({ intent: 'add', roleId: '3', parentRoleId: 'none' }).success).toBe(true)
    expect(parse({ intent: 'seat', roleId: '3', memberId: '9', kind: 'leader' }).success).toBe(true)
  })

  it('reads the personal-role checkbox on attach, absent meaning group', () => {
    const checked = parse({ intent: 'attach', name: 'Responsable estrade', parentRoleId: '4', singlePerson: 'on' })
    expect(checked.success).toBe(true)
    if (checked.success && checked.data.intent === 'attach') expect(checked.data.singlePerson).toBe(true)

    // An unchecked checkbox is simply missing from the form data.
    const unchecked = parse({ intent: 'attach', name: 'Sono', parentRoleId: '4' })
    expect(unchecked.success).toBe(true)
    if (unchecked.success && unchecked.data.intent === 'attach') expect(unchecked.data.singlePerson).toBe(false)
  })

  it('has no toggle intent: the personal-role flag is edited on the role page', () => {
    // Moved to `editRoleSchema` — the chart arranges roles, the role page defines them.
    expect(parse({ intent: 'set-single-person', roleId: '7', singlePerson: 'on' }).success).toBe(false)
  })
})
