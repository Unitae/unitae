import type { CardOverlayPath } from '~/features/territories/model/card-overlay'

export function terraDrawRingToCardOverlayPath(ring: [number, number][]): CardOverlayPath[] {
  if (ring.length < 3) return []
  const first = ring[0]
  const last = ring[ring.length - 1]
  const isClosed = first[0] === last[0] && first[1] === last[1]
  const open = isClosed ? ring.slice(0, -1) : ring
  return open.map(([lng, lat]) => ({ lat, lng }))
}

export function cardOverlayPathToTerraDrawRing(paths: CardOverlayPath[]): [number, number][] {
  if (paths.length === 0) return []
  const ring: [number, number][] = paths.map(p => [p.lng, p.lat])
  const first = ring[0]
  const last = ring[ring.length - 1]
  const isClosed = first[0] === last[0] && first[1] === last[1]
  if (isClosed) return ring
  return [...ring, [first[0], first[1]]]
}
