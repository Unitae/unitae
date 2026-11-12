import 'maplibre-gl/dist/maplibre-gl.css'

import { mapStyle } from '@unitae/tokens/map-style'
import type { ErrorEvent } from '@vis.gl/react-maplibre'
import { type StyleSpecification, setWorkerUrl } from 'maplibre-gl'
import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useMemo } from 'react'

import { getLocale } from '~/i18n/paraglide/runtime'
import { useDarkMode } from '~/shared/ui/hooks/use-dark-mode'

// What the territory maps on MapLibre share: the worker, our quiet base (`@unitae/tokens/map-style`) with tiles and
// glyphs served by the instance, and what counts as the base map failing. Imported only by the maps' own chunks,
// which run in the browser alone.

// MapLibre finds its worker next to its own module; bundled, it no longer is. The bundler hands the worker's address.
setWorkerUrl(maplibreWorker)

const GLYPHS = '/map-fonts/{fontstack}/{range}.pbf'

/** MapLibre wants full addresses; the app gives paths on its own origin. */
const absolute = (path: string) =>
  new URL(path, window.location.origin).href.replaceAll('%7B', '{').replaceAll('%7D', '}')

/** The base map's style, light or dark as the page is drawn, its labels in the reader's language. */
export function useBaseStyle(tiles: string): StyleSpecification {
  const dark = useDarkMode()
  return useMemo(
    () =>
      mapStyle({
        mode: dark ? 'dark' : 'light',
        tiles: absolute(tiles),
        glyphs: absolute(GLYPHS),
        lang: getLocale(),
      }) as StyleSpecification,
    [dark, tiles],
  )
}

/** A base tile the instance failed to serve — not a missing glyph, not an empty tile outside the area. */
export function tileFailed(event: ErrorEvent): boolean {
  const error = event.error as Error & { status?: number; url?: string }
  return (
    error.url?.includes('/map/tiles/') === true && (error.status == null || error.status === 0 || error.status >= 500)
  )
}
