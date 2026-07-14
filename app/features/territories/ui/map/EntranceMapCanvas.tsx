import {
  AdvancedMarker,
  ControlPosition,
  Map as GoogleMap,
  APIProvider as GoogleMapApiProvider,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps'
import { Info, Loader2, MapPin, MapPinOff, RefreshCw } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo } from 'react'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import { EntranceMarkerPin, type EntrancePinVariant } from '~/features/territories/ui/EntranceMarkerPin'
import MapSearchBox from '~/features/territories/ui/MapSearchBox'
import MarkerLegend from '~/features/territories/ui/MarkerLegend'
import { useMarkerClusterer } from '~/features/territories/ui/use-marker-clusterer'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'

import { type Bbox, useBboxEntrances } from './use-bbox-entrances'

export type EntranceFocusRequest = { id: number; nonce: number }

export type EntranceMapCanvasProps = {
  apiKey?: string
  buildUrl: (bbox: Bbox) => string
  /** Extra entrances always rendered on top of the viewport results. Edit-mode: own territory entrances; create-mode: draft entries. */
  extraEntrances?: BboxEntrance[]
  /** Entrance IDs whose bbox tiles should be evicted from cache when the ref changes (e.g. pending mutation set). */
  invalidateOnIds?: Iterable<number>
  /** Bumping this integer forces a full cache clear + refetch of the current viewport (e.g. after a create). */
  refreshKey?: number
  pinVariantFor: (entrance: BboxEntrance) => EntrancePinVariant
  ariaLabelFor: (entrance: BboxEntrance) => string
  selectedId: number | null
  onMarkerSelect: (entrance: BboxEntrance) => void
  onCloseSelected: () => void
  /** Rendered inside the map's `InfoWindow`. `close` collapses the popover without clearing selection elsewhere. */
  renderPopover: (entrance: BboxEntrance, close: () => void) => ReactNode
  focusRequest?: EntranceFocusRequest | null
  /** Optional overlay for edit-mode when a territory has no entrances yet. Click-through by design. */
  emptyState?: { title: string; body: string }
  /**
   * When set, the canvas surfaces a small "N sur M · X sans coordonnées" chip so the user
   * knows why pin count on the map might not match the tab's total. Create-mode only.
   */
  totalAvailable?: number
  withoutCoordinates?: number
  /** Fallback map center used when there are no extra entrances to average. Defaults to Lyon. */
  fallbackCenter?: { lat: number; lng: number }
  className?: string
}

function MapContents({
  buildUrl,
  extraEntrances = [],
  invalidateOnIds,
  refreshKey,
  pinVariantFor,
  ariaLabelFor,
  selectedId,
  onMarkerSelect,
  onCloseSelected,
  renderPopover,
  focusRequest,
  emptyState,
  totalAvailable,
  withoutCoordinates,
}: Omit<EntranceMapCanvasProps, 'apiKey' | 'className' | 'fallbackCenter'>) {
  const map = useMap()
  const getMarkerRef = useMarkerClusterer(map)
  const { viewportEntrances, truncated, truncatedTotal, loading, error, retryLastLoad } = useBboxEntrances({
    buildUrl,
    invalidateOnIds,
    refreshKey,
  })

  const extraById = useMemo(() => new Map(extraEntrances.map(e => [e.id, e])), [extraEntrances])

  const visibleEntrances = useMemo(() => {
    const merged = new Map<number, BboxEntrance>()
    for (const e of viewportEntrances) merged.set(e.id, e)
    for (const e of extraEntrances) merged.set(e.id, e)
    return [...merged.values()]
  }, [viewportEntrances, extraEntrances])

  const focusEntranceById = useCallback(
    (entranceId: number) => {
      if (map == null) return
      const target = extraById.get(entranceId) ?? viewportEntrances.find(e => e.id === entranceId)
      if (target == null) return
      map.panTo({ lat: target.latitude, lng: target.longitude })
      const currentZoom = map.getZoom()
      if (currentZoom == null || currentZoom < 16) {
        map.setZoom(17)
      }
      onMarkerSelect(target)
    },
    [map, extraById, viewportEntrances, onMarkerSelect],
  )

  useEffect(() => {
    if (focusRequest == null) return
    focusEntranceById(focusRequest.id)
  }, [focusRequest, focusEntranceById])

  const selected = selectedId != null ? (visibleEntrances.find(e => e.id === selectedId) ?? null) : null

  return (
    <>
      {visibleEntrances
        .filter(e => e.latitude != null && e.longitude != null)
        .map(entrance => {
          // Prefer the loaded entrance shape; fall back to the eagerly-loaded extra so removed-then-out-of-view
          // entrances stay visible.
          const extra = extraById.get(entrance.id)
          const display = entrance.status === 'in-this-territory' ? entrance : (extra ?? entrance)
          return (
            <AdvancedMarker
              key={display.id}
              ref={getMarkerRef(display.id)}
              position={{ lat: display.latitude, lng: display.longitude }}
              onClick={() => onMarkerSelect(display)}
            >
              <button
                type="button"
                aria-label={ariaLabelFor(display)}
                title={`${display.address.number} ${display.address.street}`}
                className="rounded-full transition motion-safe:hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <EntranceMarkerPin variant={pinVariantFor(display)} />
              </button>
            </AdvancedMarker>
          )
        })}

      {selected != null ? (
        <InfoWindow
          position={{ lat: selected.latitude, lng: selected.longitude }}
          pixelOffset={[0, -24]}
          maxWidth={380}
          onCloseClick={onCloseSelected}
          headerDisabled
        >
          {renderPopover(selected, onCloseSelected)}
        </InfoWindow>
      ) : null}

      <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-1.5 text-xs">
        {loading ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-foreground shadow-sm backdrop-blur">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {m.territories_map_loading()}
          </span>
        ) : null}
        {truncated ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary shadow-sm backdrop-blur">
            <Info className="size-3" aria-hidden="true" />
            {truncatedTotal != null
              ? m.territories_map_truncated_hint_with_count({ total: String(truncatedTotal) })
              : m.territories_map_truncated_hint()}
          </span>
        ) : null}
        {error ? (
          <button
            type="button"
            onClick={retryLastLoad}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-destructive shadow-sm backdrop-blur hover:bg-destructive/20"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            {m.territories_map_load_error()}
          </button>
        ) : null}
        {totalAvailable != null ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-muted-foreground shadow-sm backdrop-blur">
            <Info className="size-3" aria-hidden="true" />
            {m.split_tool_create_map_availability_hint({
              visible: viewportEntrances.length,
              total: totalAvailable,
            })}
            {withoutCoordinates != null && withoutCoordinates > 0 ? (
              <span className="text-destructive">
                {' · '}
                {m.split_tool_create_map_without_coordinates_hint({ count: withoutCoordinates })}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {emptyState != null ? (
        // Purely informational — no interactive content, so let clicks pass through
        // to any markers underneath.
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div className="pointer-events-none flex max-w-sm flex-col items-center gap-2 rounded-lg border bg-card/90 p-4 text-center shadow-md backdrop-blur">
            <MapPin className="size-6 text-primary" aria-hidden="true" />
            <p className="font-medium text-sm">{emptyState.title}</p>
            <p className="text-muted-foreground text-xs">{emptyState.body}</p>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute top-3 left-7 flex flex-col gap-2">
        <MapSearchBox candidates={[...extraEntrances, ...viewportEntrances]} onSelect={focusEntranceById} />
        <MarkerLegend />
      </div>
    </>
  )
}

export default function EntranceMapCanvas({
  apiKey,
  buildUrl,
  extraEntrances = [],
  invalidateOnIds,
  pinVariantFor,
  ariaLabelFor,
  selectedId,
  onMarkerSelect,
  onCloseSelected,
  renderPopover,
  focusRequest,
  emptyState,
  refreshKey,
  totalAvailable,
  withoutCoordinates,
  fallbackCenter = { lat: 45.737623, lng: 4.8371592 },
  className,
}: EntranceMapCanvasProps) {
  const { consented, grantConsent } = useMapConsent()

  if (apiKey == null) {
    return (
      <Card className={className}>
        <CardContent className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <MapPinOff className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium text-sm">{m.map_unconfigured_title()}</p>
          <p className="max-w-sm text-muted-foreground text-xs">{m.map_unconfigured_body()}</p>
        </CardContent>
      </Card>
    )
  }

  if (!consented) {
    return (
      <Card className={className}>
        <CardContent className="h-full p-0">
          <MapConsentBanner onAccept={grantConsent} />
        </CardContent>
      </Card>
    )
  }

  const validExtras = extraEntrances.filter(e => e.latitude != null && e.longitude != null)
  const center =
    validExtras.length > 0
      ? {
          lat: validExtras.reduce((s, e) => s + e.latitude, 0) / validExtras.length,
          lng: validExtras.reduce((s, e) => s + e.longitude, 0) / validExtras.length,
        }
      : fallbackCenter

  return (
    <Card className={className}>
      <CardContent className="relative h-full p-0">
        <GoogleMapApiProvider apiKey={apiKey}>
          <GoogleMap
            mapId="unitae-territory-edit"
            defaultCenter={center}
            defaultZoom={validExtras.length > 0 ? 16 : 13}
            className="h-full min-h-[500px] w-full rounded-lg"
            disableDefaultUI={true}
            zoomControl={true}
            zoomControlOptions={{ position: ControlPosition.RIGHT_BOTTOM }}
            keyboardShortcuts={true}
            gestureHandling="greedy"
          >
            <MapContents
              buildUrl={buildUrl}
              extraEntrances={extraEntrances}
              invalidateOnIds={invalidateOnIds}
              refreshKey={refreshKey}
              pinVariantFor={pinVariantFor}
              ariaLabelFor={ariaLabelFor}
              selectedId={selectedId}
              onMarkerSelect={onMarkerSelect}
              onCloseSelected={onCloseSelected}
              renderPopover={renderPopover}
              focusRequest={focusRequest}
              emptyState={emptyState}
              totalAvailable={totalAvailable}
              withoutCoordinates={withoutCoordinates}
            />
          </GoogleMap>
        </GoogleMapApiProvider>
      </CardContent>
    </Card>
  )
}
