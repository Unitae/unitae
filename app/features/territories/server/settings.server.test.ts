import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAllowedZips,
  parseTerritoryPolygon,
  parseZips,
  serializeTerritoryPolygon,
  serializeZips,
} from './settings.server'

describe('parseZips', () => {
  it('parses a comma-separated list of zips', () => {
    expect(parseZips('75001,75002,75003')).toEqual(['75001', '75002', '75003'])
  })

  it('trims whitespace around each zip', () => {
    expect(parseZips('  75001 , 75002 ,  75003')).toEqual(['75001', '75002', '75003'])
  })

  it('returns an empty string entry when input is empty (caller must filter)', () => {
    expect(parseZips('')).toEqual([''])
  })
})

describe('serializeZips', () => {
  it('joins zips with a comma-space separator', () => {
    expect(serializeZips(['75001', '75002', '75003'])).toBe('75001, 75002, 75003')
  })

  it('roundtrips through parseZips', () => {
    const input = ['75001', '75002', '75003']
    expect(parseZips(serializeZips(input))).toEqual(input)
  })
})

describe('parseTerritoryPolygon / serializeTerritoryPolygon', () => {
  it('parses a space-inside/comma-between polygon into number tuples', () => {
    expect(parseTerritoryPolygon('48.85 2.35,48.86 2.36')).toEqual([
      [48.85, 2.35],
      [48.86, 2.36],
    ])
  })

  it('serializes number tuples back to the same shape', () => {
    expect(
      serializeTerritoryPolygon([
        [48.85, 2.35],
        [48.86, 2.36],
      ]),
    ).toBe('48.85 2.35,48.86 2.36')
  })

  it('roundtrips (parse ∘ serialize = identity)', () => {
    const input: [number, number][] = [
      [48.85, 2.35],
      [48.86, 2.36],
    ]
    expect(parseTerritoryPolygon(serializeTerritoryPolygon(input))).toEqual(input)
  })
})

describe('getAllowedZips', () => {
  const mockDb = { setting: { findFirst: vi.fn() } }
  // biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
  const dbCast = mockDb as any

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns an empty array when the `zips` setting is absent', async () => {
    mockDb.setting.findFirst.mockResolvedValue(null)
    expect(await getAllowedZips(dbCast)).toEqual([])
  })

  it('parses the stored JSON value when the setting exists', async () => {
    mockDb.setting.findFirst.mockResolvedValue({ value: JSON.stringify(['75001', '75002']) })
    expect(await getAllowedZips(dbCast)).toEqual(['75001', '75002'])
  })

  it('threads the `zips` key into the findFirst filter', async () => {
    mockDb.setting.findFirst.mockResolvedValue(null)
    await getAllowedZips(dbCast)
    expect(mockDb.setting.findFirst).toHaveBeenCalledWith({ where: { key: 'zips' } })
  })
})
