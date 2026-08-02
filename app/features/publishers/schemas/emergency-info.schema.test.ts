import { describe, expect, it } from 'vitest'
import { updateEmergencyInfoSchema } from './emergency-info.schema'

describe('updateEmergencyInfoSchema — flags', () => {
  it('coerces a checked checkbox ("on") to true', () => {
    const result = updateEmergencyInfoSchema.safeParse({ dpaCardUpToDate: 'on', survivalBackpackReady: 'on' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dpaCardUpToDate).toBe(true)
      expect(result.data.survivalBackpackReady).toBe(true)
    }
  })

  it('coerces an omitted checkbox to false', () => {
    const result = updateEmergencyInfoSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dpaCardUpToDate).toBe(false)
      expect(result.data.survivalBackpackReady).toBe(false)
      expect(result.data.contacts).toEqual([])
    }
  })
})

describe('updateEmergencyInfoSchema — contacts', () => {
  it('parses a list of contacts', () => {
    const result = updateEmergencyInfoSchema.safeParse({
      contacts: [
        { name: 'Marie Dupont', relationship: 'conjoint', phone: '06 12 34 56 78' },
        { name: 'Paul Martin', relationship: 'ami', phone: '' },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contacts).toHaveLength(2)
      expect(result.data.contacts[0]).toEqual({
        name: 'Marie Dupont',
        relationship: 'conjoint',
        phone: '06 12 34 56 78',
      })
    }
  })

  it('trims the contact name and rejects an empty one', () => {
    const result = updateEmergencyInfoSchema.safeParse({ contacts: [{ name: '   ' }] })
    expect(result.success).toBe(false)
  })

  it('defaults relationship and phone to empty strings when omitted', () => {
    const result = updateEmergencyInfoSchema.safeParse({ contacts: [{ name: 'Marie' }] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contacts[0].relationship).toBe('')
      expect(result.data.contacts[0].phone).toBe('')
    }
  })

  it('rejects a contact phone containing letters', () => {
    const result = updateEmergencyInfoSchema.safeParse({ contacts: [{ name: 'Marie', phone: 'call me' }] })
    expect(result.success).toBe(false)
  })

  it('rejects more contacts than the upper bound', () => {
    const contacts = Array.from({ length: 21 }, (_, i) => ({ name: `Contact ${i}` }))
    const result = updateEmergencyInfoSchema.safeParse({ contacts })
    expect(result.success).toBe(false)
  })
})
