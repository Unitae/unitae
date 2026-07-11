import { describe, expect, it } from 'vitest'
import { GEOJSON_FILE_ACCEPT, readGeoJsonFileText } from './CardOverlayImportDialog'

describe('GEOJSON_FILE_ACCEPT', () => {
  it('accepts the .geojson extension and both mime types the export writes', () => {
    expect(GEOJSON_FILE_ACCEPT).toContain('.geojson')
    expect(GEOJSON_FILE_ACCEPT).toContain('application/geo+json')
    expect(GEOJSON_FILE_ACCEPT).toContain('application/json')
  })
})

describe('readGeoJsonFileText', () => {
  it('returns null when no file is provided', async () => {
    expect(await readGeoJsonFileText(null)).toBeNull()
  })

  it('returns null when the FileList is empty', async () => {
    expect(await readGeoJsonFileText({ length: 0, item: () => null } as unknown as FileList)).toBeNull()
  })

  it('returns the first file text', async () => {
    const file = { text: () => Promise.resolve('{"type":"FeatureCollection"}') } as unknown as File
    const list = { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList
    expect(await readGeoJsonFileText(list)).toBe('{"type":"FeatureCollection"}')
  })
})
