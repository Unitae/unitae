import { describe, expect, it } from 'vitest'
import { PublisherType, publisherTypeReportsHours } from './publisher-type'

describe('publisherTypeReportsHours', () => {
  it('retourne false pour un proclamateur normal', () => {
    expect(publisherTypeReportsHours(PublisherType.Normal)).toBe(false)
  })

  it('retourne true pour un pionnier auxiliaire', () => {
    expect(publisherTypeReportsHours(PublisherType.PionnierAuxiliaires)).toBe(true)
  })

  it('retourne true pour un pionnier permanent', () => {
    expect(publisherTypeReportsHours(PublisherType.PionnierPermanant)).toBe(true)
  })

  it('retourne true pour un pionnier spécial', () => {
    expect(publisherTypeReportsHours(PublisherType.PionnierSpecial)).toBe(true)
  })

  it('retourne true pour un missionnaire', () => {
    expect(publisherTypeReportsHours(PublisherType.Missionnaire)).toBe(true)
  })
})
