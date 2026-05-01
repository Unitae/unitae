import {
  AdvancedMarker,
  APIProvider as GoogleMapApiProvider,
  InfoWindow,
  Map as GoogleMap,
  useMap,
} from '@vis.gl/react-google-maps'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'
import EntrancePopup, { type EntrancePendingState } from '~/features/territories/ui/EntrancePopup'
import * as m from '~/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'

export type EntranceAction = 'add' | 'remove' | 'reassign' | 'undo'

type Props = {
  apiKey?: string
  territoryId: number
  territoryType: TerritoryKind
  ownEntrances: BboxEntrance[]
  pendingAdditions: ReadonlySet<number>
  pendingRemovals: ReadonlySet<number>
  pendingReassignments: ReadonlyMap<number, { fromTerritoryId: number; fromTerritoryNumber: string }>
  onAct: (entrance: BboxEntrance, action: EntranceAction) => void
  className?: string
}

const GRID = 0.01

function gridKey(bbox: { swLat: number; swLng: number; neLat: number; neLng: number }) {
  return [
    Math.floor(bbox.swLat / GRID),
    Math.floor(bbox.swLng / GRID),
    Math.ceil(bbox.neLat / GRID),
    Math.ceil(bbox.neLng / GRID),
  ].join(':')
}

function pendingStateFor(
  entrance: BboxEntrance,
  pendingAdditions: ReadonlySet<number>,
  pendingRemovals: ReadonlySet<number>,
  pendingReassignments: ReadonlyMap<number, unknown>,
): EntrancePendingState {
  if (pendingRemovals.has(entrance.id)) return 'pending-remove'
  if (pendingReassignments.has(entrance.id)) return 'pending-reassign'
  if (pendingAdditions.has(entrance.id)) return 'pending-add'
  return 'none'
}

function pinClassesFor(entrance: BboxEntrance, pending: EntrancePendingState) {
  if (pending === 'pending-remove') {
    return 'border-red-500 bg-white text-red-500 opacity-60'
  }
  if (pending === 'pending-add' || pending === 'pending-reassign') {
    return 'border-red-700 bg-red-600 text-white ring-2 ring-red-300'
  }
  if (entrance.status === 'in-this-territory') {
    return 'border-red-700 bg-red-600 text-white'
  }
  if (entrance.status === 'available') {
    return 'border-emerald-700 bg-emerald-500 text-white'
  }
  return 'border-slate-400 bg-white text-slate-500'
}

function MapContents({
  territoryId,
  territoryType,
  ownEntrances,
  pendingAdditions,
  pendingRemovals,
  pendingReassignments,
  onAct,
}: Omit<Props, 'apiKey' | 'className'>) {
  const map = useMap()
  const fetchAbort = useRef<AbortController | null>(null)
  const cacheRef = useRef<Map<string, BboxEntrance[]>>(new Map())
  const [viewportEntrances, setViewportEntrances] = useState<BboxEntrance[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<BboxEntrance | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ownById = useMemo(() => new Map(ownEntrances.map(e => [e.id, e])), [ownEntrances])

  const visibleEntrances = useMemo(() => {
    const merged = new Map<number, BboxEntrance>()
    for (const e of viewportEntrances) merged.set(e.id, e)
    for (const e of ownEntrances) merged.set(e.id, e)
    return [...merged.values()]
  }, [viewportEntrances, ownEntrances])

  const loadBbox = useCallback(
    async (bbox: { swLat: number; swLng: number; neLat: number; neLng: number }) => {
      const key = gridKey(bbox)
      const cached = cacheRef.current.get(key)
      if (cached != null) {
        setViewportEntrances(cached)
        setTruncated(false)
        return
      }

      fetchAbort.current?.abort()
      const ctrl = new AbortController()
      fetchAbort.current = ctrl
      setLoading(true)
      try {
        const params = new URLSearchParams({
          bbox: `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}`,
          territoryId: String(territoryId),
        })
        const response = await fetch(`/territories/api/entrances-in-bbox?${params.toString()}`, {
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          throw new Error(`Bbox request failed: ${response.status}`)
        }
        const data = (await response.json()) as { entrances: BboxEntrance[]; truncated: boolean }
        cacheRef.current.set(key, data.entrances)
        setViewportEntrances(data.entrances)
        setTruncated(data.truncated)
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return
        // The user can pan again to retry; we don't have a logger client-side.
      } finally {
        if (fetchAbort.current === ctrl) {
          setLoading(false)
        }
      }
    },
    [territoryId],
  )

  const handleIdle = useCallback(() => {
    if (map == null) return
    const bounds = map.getBounds()
    if (bounds == null) return
    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()
    const bbox = { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() }
    if (debounceRef.current != null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadBbox(bbox), 300)
  }, [map, loadBbox])

  useEffect(() => {
    if (map == null) return
    const listener = map.addListener('idle', handleIdle)
    return () => listener.remove()
  }, [map, handleIdle])

  // Trigger an initial load once the map is ready, in case `idle` already fired before the listener attached.
  useEffect(() => {
    if (map != null) {
      handleIdle()
    }
  }, [map, handleIdle])

  return (
    <>
      {visibleEntrances
        .filter(e => e.latitude != null && e.longitude != null)
        .map(entrance => {
          const own = ownById.get(entrance.id)
          // Prefer the loaded entrance shape; fall back to the eagerly-loaded own shape so removed-then-out-of-view entrances stay visible.
          const display = entrance.status === 'in-this-territory' ? entrance : (own ?? entrance)
          const pending = pendingStateFor(display, pendingAdditions, pendingRemovals, pendingReassignments)
          return (
            <AdvancedMarker
              key={display.id}
              position={{ lat: display.latitude, lng: display.longitude }}
              onClick={() => setSelected(display)}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 font-bold text-xs shadow-md transition ${pinClassesFor(display, pending)}`}
                title={`${display.address.number} ${display.address.street}`}
              >
                {pending === 'pending-add' || pending === 'pending-reassign' ? '+' : null}
                {pending === 'pending-remove' ? '−' : null}
                {pending === 'none' && display.status === 'in-this-territory' ? '✓' : null}
              </span>
            </AdvancedMarker>
          )
        })}

      {selected != null ? (
        <InfoWindow
          position={{ lat: selected.latitude, lng: selected.longitude }}
          onCloseClick={() => setSelected(null)}
          headerDisabled
        >
          <EntrancePopup
            entrance={selected}
            territoryType={territoryType}
            pending={pendingStateFor(selected, pendingAdditions, pendingRemovals, pendingReassignments)}
            onAct={() => {
              const pending = pendingStateFor(selected, pendingAdditions, pendingRemovals, pendingReassignments)
              if (pending !== 'none') {
                onAct(selected, 'undo')
              } else if (selected.status === 'in-this-territory') {
                onAct(selected, 'remove')
              } else if (selected.status === 'available') {
                onAct(selected, 'add')
              } else {
                onAct(selected, 'reassign')
              }
              setSelected(null)
            }}
          />
        </InfoWindow>
      ) : null}

      <div className="pointer-events-none absolute top-2 right-2 flex flex-col gap-1 text-xs">
        {loading ? (
          <span className="rounded-md bg-white/90 px-2 py-1 shadow">{m.territories_map_loading()}</span>
        ) : null}
        {truncated ? (
          <span className="rounded-md bg-amber-100/90 px-2 py-1 text-amber-900 shadow">
            {m.territories_map_truncated_hint()}
          </span>
        ) : null}
      </div>
    </>
  )
}

export default function BuildingEntranceMapEditor({
  apiKey,
  territoryId,
  territoryType,
  ownEntrances,
  pendingAdditions,
  pendingRemovals,
  pendingReassignments,
  onAct,
  className,
}: Props) {
  const { consented, grantConsent } = useMapConsent()

  if (apiKey == null) return null

  if (!consented) {
    return (
      <Card className={className}>
        <CardContent className="h-full p-0">
          <MapConsentBanner onAccept={grantConsent} />
        </CardContent>
      </Card>
    )
  }

  const validOwn = ownEntrances.filter(e => e.latitude != null && e.longitude != null)
  const center =
    validOwn.length > 0
      ? {
          lat: validOwn.reduce((s, e) => s + e.latitude, 0) / validOwn.length,
          lng: validOwn.reduce((s, e) => s + e.longitude, 0) / validOwn.length,
        }
      : { lat: 45.737623, lng: 4.8371592 }

  return (
    <Card className={className}>
      <CardContent className="relative h-full p-0">
        <GoogleMapApiProvider apiKey={apiKey}>
          <GoogleMap
            mapId="unitae-territory-edit"
            defaultCenter={center}
            defaultZoom={validOwn.length > 0 ? 16 : 13}
            className="h-full min-h-[500px] w-full rounded-lg"
            disableDefaultUI={false}
            gestureHandling="greedy"
          >
            <MapContents
              territoryId={territoryId}
              territoryType={territoryType}
              ownEntrances={ownEntrances}
              pendingAdditions={pendingAdditions}
              pendingRemovals={pendingRemovals}
              pendingReassignments={pendingReassignments}
              onAct={onAct}
            />
          </GoogleMap>
        </GoogleMapApiProvider>
      </CardContent>
    </Card>
  )
}
