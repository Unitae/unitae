import { describe, expect, it } from 'vitest'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { appearanceFor, appearanceInputSchema, parseAppearance } from './appearance.schema'

describe('appearanceInputSchema', () => {
  it('accepts only the curated choices', () => {
    expect(appearanceInputSchema.safeParse({ typeface: 'serif', accent: 'wine', layout: 'bands' }).success).toBe(true)
    expect(appearanceInputSchema.safeParse({ typeface: 'Comic Sans', accent: 'wine', layout: 'bands' }).success).toBe(
      false,
    )
    expect(appearanceInputSchema.safeParse({ typeface: 'serif', accent: '#ff00ff', layout: 'bands' }).success).toBe(
      false,
    )
  })
})

describe('appearanceFor', () => {
  it('keeps a layout the document offers', () => {
    expect(
      appearanceFor(DynamicType.PublisherGroups, { typeface: 'atkinson', accent: 'plum', layout: 'bands' }),
    ).toEqual({
      typeface: 'atkinson',
      accent: 'plum',
      layout: 'bands',
    })
  })

  it('gives a layout the document does not offer its default instead', () => {
    expect(appearanceFor(DynamicType.Programme, { typeface: 'fira', accent: 'teal', layout: 'bands' }).layout).toBe(
      'list',
    )
  })
})

describe('parseAppearance', () => {
  it('gives a document without an appearance the defaults', () => {
    expect(parseAppearance(DynamicType.Organigram, null)).toEqual({
      typeface: 'fira',
      accent: 'teal',
      layout: 'leader',
    })
  })

  it('reads what was stored', () => {
    expect(parseAppearance(DynamicType.Organigram, { typeface: 'serif', accent: 'black', layout: 'chart' })).toEqual({
      typeface: 'serif',
      accent: 'black',
      layout: 'chart',
    })
  })

  it('falls back field by field, keeping the choices that still read', () => {
    expect(parseAppearance(DynamicType.Pioneers, { typeface: 'serif', accent: 'gold', layout: 'chart' })).toEqual({
      typeface: 'serif',
      accent: 'teal',
      layout: 'sections',
    })
  })
})
