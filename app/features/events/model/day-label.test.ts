import { describe, expect, it } from 'vitest'
import { dayLabel, dayLabelShort } from './day-label'

describe('dayLabel', () => {
  it('names a weekday (0 is Sunday) in the reader’s language, capitalised as a label', () => {
    expect(dayLabel(0)).toBe('Dimanche')
    expect(dayLabel(2)).toBe('Mardi')
  })

  it('shortens it for narrow places', () => {
    expect(dayLabelShort(2)).toBe('Mar.')
  })

  it('says nothing for a day that is not one', () => {
    expect(dayLabel(9)).toBe('')
  })
})
