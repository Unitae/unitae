import { describe, expect, it } from 'vitest'
import { templateKey } from './template-key'

describe('templateKey', () => {
  it('makes the key from the name, without accents or spaces', () => {
    expect(templateKey('Réunion du week-end', [])).toBe('reunion-du-week-end')
  })

  it('numbers it when the congregation already has that key', () => {
    expect(templateKey('Mémorial', ['memorial', 'memorial-2'])).toBe('memorial-3')
  })

  it('falls back on a generic key for a name with no letter or digit', () => {
    expect(templateKey('—', [])).toBe('modele')
  })
})
