export function pointInPolygon([lat, long]: [number, number], polygon: [number, number][]) {
  let isInside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]

    const intersect = yi > long !== yj > long && lat < ((xj - xi) * (long - yi)) / (yj - yi) + xi
    if (intersect) isInside = !isInside
  }

  return isInside
}
