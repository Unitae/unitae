type Coord = { latitude: number | null; longitude: number | null }

export function computeEntranceCentroid(buildings: Coord[]): { latitude: number; longitude: number } | null {
  const valid = buildings.filter(
    (b): b is { latitude: number; longitude: number } => b.latitude != null && b.longitude != null,
  )
  if (valid.length === 0) return null

  const latitude = valid.reduce((sum, b) => sum + b.latitude, 0) / valid.length
  const longitude = valid.reduce((sum, b) => sum + b.longitude, 0) / valid.length
  return { latitude, longitude }
}
