import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { loader } from './map-fonts'

// The glyphs the app does not ship (scripts beyond Latin, Cyrillic and Greek) come from Noto Sans.

const glyphs = (fontstack: string, range: string) => loader({ params: { fontstack, range } } as never) as Response

describe('the map glyph fallback', () => {
  it('answers a script the map fonts lack with Noto Sans, gzipped', async () => {
    const response = glyphs('Unitae Map Regular', '1536-1791.pbf') // Arabic
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Encoding')).toBe('gzip')
    expect(gunzipSync(Buffer.from(await response.arrayBuffer())).byteLength).toBeGreaterThan(1000)
  })

  it('answers the Devanagari face Protomaps asks for too', () => {
    expect(glyphs('Noto Sans Devanagari Regular v1', '2304-2559.pbf').status).toBe(200)
  })

  it('refuses anything that is not a glyph range', () => {
    for (const range of ['../../package.json', '0-255', '1-256.pbf', '0-511.pbf', '65536-65791.pbf']) {
      expect(glyphs('Unitae Map Regular', range).status).toBe(400)
    }
  })
})
