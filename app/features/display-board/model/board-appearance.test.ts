import { describe, expect, it } from 'vitest'
import { BOARD_LAYOUTS, defaultAppearance, isBoardLayout } from './board-appearance'
import { DynamicType } from './dynamic-document.type'

describe('defaultAppearance', () => {
  it.each(Object.values(DynamicType))('gives a %s document Fira Sans, teal and its first layout', type => {
    expect(defaultAppearance(type)).toEqual({ typeface: 'fira', accent: 'teal', layout: BOARD_LAYOUTS[type][0] })
  })
})

describe('isBoardLayout', () => {
  it('accepts only the layouts a document offers', () => {
    expect(isBoardLayout(DynamicType.PublisherGroups, 'bands')).toBe(true)
    expect(isBoardLayout(DynamicType.Pioneers, 'bands')).toBe(false)
    expect(isBoardLayout(DynamicType.Programme, 'columns')).toBe(false)
  })
})
