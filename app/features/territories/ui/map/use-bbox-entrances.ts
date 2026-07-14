import { useMap } from '@vis.gl/react-google-maps'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BboxEntrance } from '~/features/territories/server/buildings.server'

export type Bbox = { swLat: number; swLng: number; neLat: number; neLng: number }

const GRID = 0.01

function gridKey(bbox: Bbox) {
  return [
    Math.floor(bbox.swLat / GRID),
    Math.floor(bbox.swLng / GRID),
    Math.ceil(bbox.neLat / GRID),
    Math.ceil(bbox.neLng / GRID),
  ].join(':')
}

type UseBboxEntrancesOptions = {
  buildUrl: (bbox: Bbox) => string
  invalidateOnIds?: Iterable<number>
  /**
   * Bumping this integer clears the entire bbox cache and refetches the current viewport.
   * Use after a mutation that changes what the server would return (e.g. creating a territory
   * that removes entrances from the "available for create" set).
   */
  refreshKey?: number
}

export type UseBboxEntrancesResult = {
  viewportEntrances: BboxEntrance[]
  truncated: boolean
  truncatedTotal: number | null
  loading: boolean
  error: boolean
  retryLastLoad: () => void
  handleIdle: () => void
}

export function useBboxEntrances({
  buildUrl,
  invalidateOnIds,
  refreshKey,
}: UseBboxEntrancesOptions): UseBboxEntrancesResult {
  const map = useMap()
  const fetchAbort = useRef<AbortController | null>(null)
  const cacheRef = useRef<Map<string, BboxEntrance[]>>(new Map())
  const entranceToKeysRef = useRef<Map<number, Set<string>>>(new Map())
  const lastBboxRef = useRef<Bbox | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [viewportEntrances, setViewportEntrances] = useState<BboxEntrance[]>([])
  const [truncated, setTruncated] = useState(false)
  const [truncatedTotal, setTruncatedTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const loadBbox = useCallback(
    async (bbox: Bbox) => {
      lastBboxRef.current = bbox
      const key = gridKey(bbox)
      const cached = cacheRef.current.get(key)
      if (cached != null) {
        setViewportEntrances(cached)
        setTruncated(false)
        setTruncatedTotal(null)
        setError(false)
        return
      }

      fetchAbort.current?.abort()
      const ctrl = new AbortController()
      fetchAbort.current = ctrl
      setLoading(true)
      setError(false)
      try {
        const response = await fetch(buildUrl(bbox), {
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          throw new Error(`Bbox request failed: ${response.status}`)
        }
        const data = (await response.json()) as {
          entrances: BboxEntrance[]
          truncated: boolean
          total: number | null
        }
        cacheRef.current.set(key, data.entrances)
        for (const entrance of data.entrances) {
          let keys = entranceToKeysRef.current.get(entrance.id)
          if (keys == null) {
            keys = new Set()
            entranceToKeysRef.current.set(entrance.id, keys)
          }
          keys.add(key)
        }
        setViewportEntrances(data.entrances)
        setTruncated(data.truncated)
        setTruncatedTotal(data.total)
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        setError(true)
      } finally {
        if (fetchAbort.current === ctrl) {
          setLoading(false)
        }
      }
    },
    [buildUrl],
  )

  const invalidateCacheFor = useCallback((entranceId: number) => {
    const keys = entranceToKeysRef.current.get(entranceId)
    if (keys == null) return
    for (const key of keys) cacheRef.current.delete(key)
    entranceToKeysRef.current.delete(entranceId)
  }, [])

  // Invalidate cached bbox tiles whenever any watched entrance's local state changes
  // (e.g. a pending add/remove/reassign), so status badges stay accurate on tiles the
  // user pans back to.
  useEffect(() => {
    if (invalidateOnIds == null) return
    for (const id of invalidateOnIds) invalidateCacheFor(id)
  }, [invalidateOnIds, invalidateCacheFor])

  // On refreshKey bump: nuke every cached tile and refetch the current viewport.
  // Used after a server-side mutation (e.g. successful create) so pins pick up new statuses
  // even if the user hasn't moved the map.
  const firstRefresh = useRef(true)
  useEffect(() => {
    if (refreshKey == null) return
    if (firstRefresh.current) {
      firstRefresh.current = false
      return
    }
    cacheRef.current.clear()
    entranceToKeysRef.current.clear()
    setViewportEntrances([])
    if (lastBboxRef.current != null) loadBbox(lastBboxRef.current)
  }, [refreshKey, loadBbox])

  const retryLastLoad = useCallback(() => {
    if (lastBboxRef.current != null) loadBbox(lastBboxRef.current)
  }, [loadBbox])

  const handleIdle = useCallback(() => {
    if (map == null) return
    const bounds = map.getBounds()
    if (bounds == null) return
    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()
    const bbox = {
      swLat: sw.lat(),
      swLng: sw.lng(),
      neLat: ne.lat(),
      neLng: ne.lng(),
    }
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
    if (map != null) handleIdle()
  }, [map, handleIdle])

  return { viewportEntrances, truncated, truncatedTotal, loading, error, retryLastLoad, handleIdle }
}
