import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import type { EntranceStanding } from '~/features/territories/model/territory-draft'

/** An entrance on the editor's map: where it stands, and the territory of the type holding it, if another one. */
export interface MapEntrance extends EditorEntrance {
  standing: EntranceStanding
  otherTerritory: { id: number; number: string } | null
}

/** One of the territory's own entrances, as the map and the card see it. */
export function ownMapEntrance(entrance: EditorEntrance): MapEntrance {
  return { ...entrance, standing: 'in-this-territory', otherTerritory: null }
}
