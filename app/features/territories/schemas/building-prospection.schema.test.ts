import { parseWithZod } from '@conform-to/zod/v4'
import { describe, expect, it } from 'vitest'
import { buildingProspectionSchema } from './building-prospection.schema'

function parse(entries: [string, string][]) {
  const form = new FormData()
  for (const [name, value] of entries) form.append(name, value)
  return parseWithZod(form, { schema: buildingProspectionSchema })
}

describe('buildingProspectionSchema', () => {
  it('accepts several shops when one has no category or no notes, keeping each in its place', () => {
    const result = parse([
      ['shopkinds', ''],
      ['commerce-notes', 'Fermé le lundi'],
      ['shopkinds', 'autre'],
      ['commerce-notes', ''],
    ])

    expect(result.status).toBe('success')
    expect(result.status === 'success' && result.value.shopkinds).toEqual(['', 'autre'])
    expect(result.status === 'success' && result.value['commerce-notes']).toEqual(['Fermé le lundi', ''])
  })

  it('reads a single shop as a list of one and drops the key the form posts to count changes', () => {
    const result = parse([
      ['commerce-key', '12'],
      ['shopkinds', 'autre'],
      ['commerce-notes', 'Ouvert le dimanche'],
    ])

    expect(result.status).toBe('success')
    expect(result.status === 'success' && result.value.shopkinds).toEqual(['autre'])
    expect(result.status === 'success' && result.value['commerce-notes']).toEqual(['Ouvert le dimanche'])
    expect(result.status === 'success' && 'commerce-key' in result.value).toBe(false)
  })
})
