import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/messages', () => ({
  groups_form_already_responsible: ({ name }: { name: string }) => `oversees ${name}`,
  groups_form_already_deputy: ({ name }: { name: string }) => `assists ${name}`,
}))

const { groupLeaderAvailability } = await import('./group-leader-availability')

const free = { id: 1, responsibleFor: null, deputyFor: null }
const overseerOfNord = { id: 2, responsibleFor: { id: 10, name: 'Nord' }, deputyFor: null }
const deputyOfSud = { id: 3, responsibleFor: null, deputyFor: { id: 20, name: 'Sud' } }

describe('groupLeaderAvailability', () => {
  it('holds back the brothers who already lead a group, with the reason', () => {
    const { disabledIds, disabledReason } = groupLeaderAvailability([free, overseerOfNord, deputyOfSud])

    expect(disabledIds).toEqual([2, 3])
    expect(disabledReason(2)).toBe('oversees Nord')
    expect(disabledReason(3)).toBe('assists Sud')
    expect(disabledReason(1)).toBeUndefined()
  })

  // The edit form: the group's own overseer and deputy stay selectable, so they can swap places.
  it('offers the leaders of the group being edited', () => {
    const { disabledIds } = groupLeaderAvailability([free, overseerOfNord, deputyOfSud], 10)

    expect(disabledIds).toEqual([3])
  })
})
