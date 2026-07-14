import { describe, expect, it } from 'vitest'
import { availableFooterFor } from './EntrancePopup'

describe('availableFooterFor', () => {
  it('shows the "add" primary CTA when nothing is pending', () => {
    const footer = availableFooterFor('none')
    expect(footer.variant).toBe('default')
    expect(footer.label).not.toBe('')
  })

  it('shows an "undo" outline CTA for edit-mode pending states', () => {
    for (const pending of ['pending-add', 'pending-remove', 'pending-reassign'] as const) {
      const footer = availableFooterFor(pending)
      expect(footer.variant).toBe('outline')
    }
  })

  it('shows a "remove from selection" outline CTA when pending-select (split-tool draft)', () => {
    const footer = availableFooterFor('pending-select')
    expect(footer.variant).toBe('outline')
    // Distinct from the generic "undo" so the user knows what action reverses
    expect(footer.label).not.toBe(availableFooterFor('pending-add').label)
  })
})
