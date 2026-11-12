import { hexColors } from '@unitae/tokens'
import { MapDot } from '@unitae/ui'
import { Layer, Marker, Source } from '@vis.gl/react-maplibre'
import { useMemo } from 'react'

import type { PinState } from '~/features/territories/model/territory-draft'
import * as m from '~/i18n/paraglide/messages'
import { useDarkMode } from '~/shared/ui/hooks/use-dark-mode'
import { cn } from '~/shared/utils/utils'
import { addressOf } from './editor-labels'
import type { MapEntrance } from './editor-map-entrance'

// What the editor's map draws over its base: each entrance as a button carrying its state, and the territory's
// outline under them. Part of the map's chunk, browser only.

interface EntranceMarkerProps {
  entrance: MapEntrance
  state: PinState
  selected: boolean
  hot: boolean
  onSelect: (entrance: MapEntrance) => void
  onHover: (id: number | null) => void
}

/** An entrance on the map: a button named by its address and state, the dot shaped by the state. */
export function EntranceMarker({ entrance, state, selected, hot, onSelect, onHover }: EntranceMarkerProps) {
  if (entrance.latitude == null || entrance.longitude == null) return null
  const label = pinLabel(entrance, state)
  return (
    <Marker longitude={entrance.longitude} latitude={entrance.latitude} style={{ zIndex: selected ? 3 : hot ? 2 : 1 }}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={selected}
        onClick={() => onSelect(entrance)}
        onMouseEnter={() => onHover(entrance.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(entrance.id)}
        onBlur={() => onHover(null)}
        className={cn(
          'relative grid cursor-pointer place-content-center rounded-full transition-transform duration-(--u-duration-fast) before:absolute before:-inset-1.5 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 max-xl:before:-inset-3',
          hot && 'scale-120',
          selected && 'scale-125 outline-2 outline-foreground outline-offset-3',
        )}
      >
        <MapDot state={state} />
      </button>
    </Marker>
  )
}

function pinLabel(entrance: MapEntrance, state: PinState): string {
  const address = addressOf(entrance)
  if (state === 'in') return m.territory_editor_pin_in({ address })
  if (state === 'free') return m.territory_editor_pin_free({ address })
  if (state === 'add') return m.territory_editor_pin_added({ address })
  if (state === 'remove') return m.territory_editor_pin_removed({ address })
  return m.territory_editor_pin_other({ address })
}

/** The territory's outline, drawn by the map under the entrances, in the accent of the page's light or dark. */
export function OutlineLayer({ points }: { points: { lat: number; lng: number }[] }) {
  const accent = hexColors[useDarkMode() ? 'dark' : 'light'].accent
  const shape = useMemo(
    () =>
      points.length < 3
        ? null
        : {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'Polygon' as const,
              coordinates: [[...points, points[0]].map(point => [point.lng, point.lat])],
            },
          },
    [points],
  )
  if (shape == null) return null
  return (
    <Source id="territory-outline" type="geojson" data={shape}>
      <Layer id="territory-outline-fill" type="fill" paint={{ 'fill-color': accent, 'fill-opacity': 0.06 }} />
      <Layer
        id="territory-outline-line"
        type="line"
        paint={{ 'line-color': accent, 'line-opacity': 0.8, 'line-width': 1.5 }}
      />
    </Source>
  )
}
