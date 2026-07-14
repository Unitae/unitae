/**
 * Geographic bounding box in WGS84 degrees. SW corner is the (min lat, min lng);
 * NE corner is the (max lat, max lng). Consumers include the map viewport hook,
 * the entrances-in-bbox API parser, and the server-side entrance-in-bbox query.
 */
export type Bbox = {
  swLat: number
  swLng: number
  neLat: number
  neLng: number
}
