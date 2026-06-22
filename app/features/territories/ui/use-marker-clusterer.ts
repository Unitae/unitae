import { MarkerClusterer } from '@googlemaps/markerclusterer'
import type { AdvancedMarkerRef } from '@vis.gl/react-google-maps'
import { useCallback, useEffect, useRef } from 'react'
import { createCoalescedRenderer } from './marker-clusterer-utils'

export type MarkerRefCallback = (marker: AdvancedMarkerRef) => void

export function useMarkerClusterer(map: google.maps.Map | null) {
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const markersRef = useRef<Map<number, AdvancedMarkerRef>>(new Map())
  const refCallbacksRef = useRef<Map<number, MarkerRefCallback>>(new Map())
  const scheduleRenderRef = useRef<(() => void) | null>(null)
  if (scheduleRenderRef.current == null) {
    scheduleRenderRef.current = createCoalescedRenderer(() => clustererRef.current)
  }

  useEffect(() => {
    if (map == null) return
    const clusterer = new MarkerClusterer({ map })
    clustererRef.current = clusterer
    for (const marker of markersRef.current.values()) {
      if (marker != null) clusterer.addMarker(marker, true)
    }
    clusterer.render()
    return () => {
      clusterer.clearMarkers()
      if (clustererRef.current === clusterer) clustererRef.current = null
    }
  }, [map])

  return useCallback((id: number): MarkerRefCallback => {
    const cached = refCallbacksRef.current.get(id)
    if (cached != null) return cached
    const cb: MarkerRefCallback = marker => {
      const previous = markersRef.current.get(id) ?? null
      if (marker === previous) return
      const clusterer = clustererRef.current
      // noDraw=true on add/remove — the coalesced renderer flushes one render() per microtask
      // regardless of how many ref callbacks fire in a single React commit.
      if (previous != null && clusterer != null) clusterer.removeMarker(previous, true)
      if (marker != null) {
        markersRef.current.set(id, marker)
        if (clusterer != null) clusterer.addMarker(marker, true)
      } else {
        markersRef.current.delete(id)
      }
      scheduleRenderRef.current?.()
    }
    refCallbacksRef.current.set(id, cb)
    return cb
  }, [])
}
