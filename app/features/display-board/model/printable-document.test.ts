import { describe, expect, it } from 'vitest'
import { DynamicType } from './dynamic-document.type'
import { isPrintableDynamicDocument } from './printable-document'

describe('isPrintableDynamicDocument', () => {
  it('prints an organigram that has at least one node', () => {
    expect(isPrintableDynamicDocument({ type: DynamicType.Organigram, tree: [{}] })).toBe(true)
    expect(isPrintableDynamicDocument({ type: DynamicType.Organigram, tree: [] })).toBe(false)
  })

  it('prints publisher groups when there is at least one group', () => {
    expect(isPrintableDynamicDocument({ type: DynamicType.PublisherGroups, groups: [{}] })).toBe(true)
    expect(isPrintableDynamicDocument({ type: DynamicType.PublisherGroups, groups: [] })).toBe(false)
  })

  it('prints pioneers when there is at least one pioneer', () => {
    expect(isPrintableDynamicDocument({ type: DynamicType.Pioneers, pioneers: [{}] })).toBe(true)
    expect(isPrintableDynamicDocument({ type: DynamicType.Pioneers, pioneers: [] })).toBe(false)
  })

  it('does not print a type it does not know', () => {
    expect(isPrintableDynamicDocument({ type: 'unknown-type', events: [{}] } as never)).toBe(false)
  })

  it('does not print a programme yet', () => {
    expect(isPrintableDynamicDocument({ type: DynamicType.Programme, events: [{}] })).toBe(false)
  })
})
