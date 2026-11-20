import { describe, expect, it } from 'vitest'
import { templateKey } from './template-key'

describe('templateKey', () => {
  it('makes the key from the name, without accents or spaces', () => {
    expect(templateKey('Réunion du week-end', [])).toBe('reunion-du-week-end')
  })

  it('numbers it when the congregation already has that key', () => {
    expect(templateKey('Mémorial', ['memorial', 'memorial-2'])).toBe('memorial-3')
  })

  // A built-in key means something to the app (a system template, a meeting the job creates): a template named after one
  // never takes it, even where the congregation has no such template — the day-off one is gone everywhere.
  it('never gives a template a built-in key', () => {
    expect(templateKey('Day off', [])).toBe('day-off-2')
    expect(templateKey('Freeform', [])).toBe('freeform-2')
    expect(templateKey('Midweek meeting', [])).toBe('midweek-meeting-2')
  })

  it('falls back on a generic key for a name with no letter or digit', () => {
    expect(templateKey('—', [])).toBe('modele')
  })
})
