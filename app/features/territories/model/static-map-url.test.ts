import { describe, expect, it } from 'vitest'
import type { CardOverlay } from './card-overlay'
import { buildTerritoryStaticMapUrl } from './static-map-url'

const SAMPLE_OVERLAY: CardOverlay = {
  id: 1,
  name: 'Zone test',
  color: '#C2175B',
  paths: [
    { lat: 45.75, lng: 4.83 },
    { lat: 45.76, lng: 4.84 },
    { lat: 45.77, lng: 4.85 },
    { lat: 45.75, lng: 4.83 },
  ],
}

describe('buildTerritoryStaticMapUrl', () => {
  it('place le marqueur jaune et applique le zoom de secours quand aucun overlay', () => {
    const url = buildTerritoryStaticMapUrl({
      apiKey: 'KEY',
      size: '300x450',
      scale: 2,
      marker: { lat: 45.7, lng: 4.8 },
      overlays: [],
    })
    expect(url).toContain('markers=color%3Ayellow%7C45.7%2C4.8')
    expect(url).toContain('zoom=15')
    expect(url).not.toContain('path=')
  })

  it('omet zoom quand au moins un overlay est fourni — Static Maps auto-fit', () => {
    const url = buildTerritoryStaticMapUrl({
      apiKey: 'KEY',
      size: '300x450',
      scale: 2,
      marker: { lat: 45.7, lng: 4.8 },
      overlays: [SAMPLE_OVERLAY],
    })
    expect(url).not.toContain('zoom=')
    expect(url).toContain('path=')
  })

  it('encode chaque overlay avec couleur, contour et points', () => {
    const url = buildTerritoryStaticMapUrl({
      apiKey: 'KEY',
      size: '300x450',
      scale: 2,
      marker: null,
      overlays: [SAMPLE_OVERLAY],
    })
    const decoded = decodeURIComponent(url.split('path=')[1])
    expect(decoded).toBe('color:0xC2175Bff|weight:1|fillcolor:0xC2175B80|45.75,4.83|45.76,4.84|45.77,4.85|45.75,4.83')
  })

  it('inclut map_id seulement quand fourni', () => {
    const without = buildTerritoryStaticMapUrl({ apiKey: 'K', size: '1x1', scale: 1, overlays: [] })
    expect(without).not.toContain('map_id=')
    const withId = buildTerritoryStaticMapUrl({ apiKey: 'K', size: '1x1', scale: 1, mapId: 'STYLE', overlays: [] })
    expect(withId).toContain('map_id=STYLE')
  })

  it('ne contient aucune coordonnée codée en dur (pas de Lyon)', () => {
    const url = buildTerritoryStaticMapUrl({ apiKey: 'K', size: '1x1', scale: 1, overlays: [] })
    expect(url).not.toContain('45.7259019')
    expect(url).not.toContain('4.8346763')
    expect(url).not.toContain('0xC2175B')
    expect(url).not.toContain('0x0E9A6C')
    expect(url).not.toContain('0x2289BC')
  })

  it("dessine le périmètre en gris quand aucune zone n'est définie", () => {
    const url = buildTerritoryStaticMapUrl({
      apiKey: 'KEY',
      size: '300x450',
      scale: 2,
      marker: { lat: 45.7, lng: 4.8 },
      overlays: [],
      perimeter: SAMPLE_OVERLAY.paths,
    })
    expect(url).not.toContain('zoom=')
    expect(url).toContain('path=')
    expect(url).toContain(encodeURIComponent('color:0x6B7280ff'))
    expect(url).toContain(encodeURIComponent('fillcolor:0x6B728020'))
  })

  it('omet le périmètre dès lors qu’une zone est dessinée', () => {
    const url = buildTerritoryStaticMapUrl({
      apiKey: 'KEY',
      size: '300x450',
      scale: 2,
      marker: { lat: 45.7, lng: 4.8 },
      overlays: [SAMPLE_OVERLAY],
      perimeter: SAMPLE_OVERLAY.paths,
    })
    const pathSegments = url.split('path=').slice(1)
    expect(pathSegments).toHaveLength(1)
    expect(url).not.toContain('0x6B7280')
    expect(url).toContain('0xC2175B')
  })

  it('refuse un périmètre invalide (moins de 3 sommets)', () => {
    const url = buildTerritoryStaticMapUrl({
      apiKey: 'KEY',
      size: '300x450',
      scale: 2,
      marker: { lat: 45.7, lng: 4.8 },
      overlays: [],
      perimeter: [
        { lat: 45.7, lng: 4.8 },
        { lat: 45.71, lng: 4.81 },
      ],
    })
    expect(url).not.toContain('0x6B7280')
    expect(url).toContain('zoom=15')
  })
})
