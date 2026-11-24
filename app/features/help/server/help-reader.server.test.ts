import { describe, expect, it } from 'vitest'
import { helpReaderFor } from '~/features/help/server/help-reader.server'
import type { SanitizedAccount } from '~/shared/auth/sanitize-account.server'
import { Permission } from '~/shared/types/permission'

const GROUP = { id: 3, name: 'Nord' }

function account(member: { responsibleFor: unknown; deputyFor: unknown } | null): SanitizedAccount {
  return { member } as never
}

describe('helpReaderFor', () => {
  it('keeps the permissions it is given', () => {
    const permissions = new Set([Permission.CanViewBoard])

    expect(helpReaderFor(permissions, account(null)).permissions).toBe(permissions)
  })

  it('counts the overseer of a group as leading one', () => {
    expect(helpReaderFor(new Set(), account({ responsibleFor: GROUP, deputyFor: null })).leadsGroup).toBe(true)
  })

  it('counts the assistant of a group as leading one', () => {
    expect(helpReaderFor(new Set(), account({ responsibleFor: null, deputyFor: GROUP })).leadsGroup).toBe(true)
  })

  it('leads no group for a record that leads none, nor for an account without a record', () => {
    expect(helpReaderFor(new Set(), account({ responsibleFor: null, deputyFor: null })).leadsGroup).toBe(false)
    expect(helpReaderFor(new Set(), account(null)).leadsGroup).toBe(false)
  })

  it('answers for a schedule only when told so: the events feature decides', () => {
    expect(helpReaderFor(new Set(), account(null)).answersForSchedule).toBe(false)
    expect(helpReaderFor(new Set(), account(null), true).answersForSchedule).toBe(true)
  })
})
