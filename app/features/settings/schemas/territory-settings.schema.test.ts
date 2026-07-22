import { describe, expect, it } from 'vitest'
import { territorySettingsSchema } from './territory-settings.schema'

function parseBanoUrl(value: string) {
  return territorySettingsSchema.safeParse({ zips: '', 'bano-url': value, 'prospection-validity': '' })
}

describe('territorySettingsSchema bano-url', () => {
  it('accepts an empty value', () => {
    expect(parseBanoUrl('').success).toBe(true)
  })

  it('accepts a valid https URL', () => {
    expect(parseBanoUrl('https://bano.openstreetmap.fr/data/bano.csv').success).toBe(true)
  })

  it('rejects a non-https URL', () => {
    expect(parseBanoUrl('http://bano.openstreetmap.fr/data/bano.csv').success).toBe(false)
  })

  it('rejects a syntactically invalid URL', () => {
    expect(parseBanoUrl('not a url').success).toBe(false)
  })
})
