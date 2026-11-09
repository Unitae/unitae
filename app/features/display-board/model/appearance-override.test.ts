import { describe, expect, it } from 'vitest'
import { readAppearanceOverride } from '~/features/display-board/model/appearance-override'

describe('readAppearanceOverride', () => {
  it('reads the appearance a form has not saved yet from the address', () => {
    const params = new URLSearchParams('typeface=serif&accent=wine&layout=bands')

    expect(readAppearanceOverride(params)).toEqual({ typeface: 'serif', accent: 'wine', layout: 'bands' })
  })

  it('gives nothing when the address carries none, so the saved one applies', () => {
    expect(readAppearanceOverride(new URLSearchParams('eventId=4'))).toBeNull()
  })

  it('passes each value on as given: the appearance parser keeps only the ones a document offers', () => {
    expect(readAppearanceOverride(new URLSearchParams('accent=<script>'))).toEqual({ accent: '<script>' })
  })
})
