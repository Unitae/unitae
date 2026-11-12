import type { Bbox } from './bbox.type'

/** What a territory map needs from the instance: where its base map's tiles are, and the area it may show. */
export interface BaseMap {
  /** The tile address template, with the archive's edition in it so the browser may keep the tiles. */
  tiles: string
  /** The congregation's area: the map stays within it, and only its tiles are served. */
  area: Bbox
}
