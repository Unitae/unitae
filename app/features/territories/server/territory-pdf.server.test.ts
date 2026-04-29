import { describe, expect, it } from 'vitest'
import { showPhoneOnTerritoryCard } from './territory-pdf.server'

describe('showPhoneOnTerritoryCard', () => {
  it('shows phone data when no dedicated phone territory cards exist', () => {
    expect(showPhoneOnTerritoryCard(false)).toBe(true)
  })

  it('hides phone data on regular cards when dedicated phone territory cards exist', () => {
    expect(showPhoneOnTerritoryCard(true)).toBe(false)
  })
})
