import { describe, expect, it } from 'vitest'
import { countChangedFields } from './form-changes'

function form(entries: [string, string][]): FormData {
  const data = new FormData()
  for (const [name, value] of entries) data.append(name, value)
  return data
}

describe('countChangedFields', () => {
  it('counts the fields whose values differ, including ones that appeared or went away', () => {
    const before = form([
      ['number', '12'],
      ['street', 'rue des Coteaux'],
      ['zip', '69100'],
    ])
    const after = form([
      ['number', '12'],
      ['street', 'Rue des Coteaux'],
      ['latitude', '45.76'],
    ])
    expect(countChangedFields(before, after)).toBe(3)
  })

  it('finds nothing when every value is back to what it was', () => {
    const before = form([['number', '12']])
    expect(countChangedFields(before, form([['number', '12']]))).toBe(0)
  })
})
