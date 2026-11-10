/** An entrance as the territory editor shows it: on the map when it has a position, in the list always. */
export interface EditorEntrance {
  id: number
  /** The numbers of its buildings joined (« 12, 14 »), their street and postcode. */
  address: { number: string; street: string; zip: string }
  latitude: number | null
  longitude: number | null
  homes: number
  phones: number
  liberals: number
  /** What kind of shop, for a shop entrance. */
  shopKind: string | null
  /** The first building: where « Bâtiment » leads. */
  buildingId: number
  prospectionDate: string | null
  /** How to get in, for the entrance card: the main way in, the others, and what they allow. */
  access?: number | null
  accesses?: { type: number }[]
  isPMR?: boolean | null
  isOpenEarly?: boolean | null
  isMailboxOpen?: boolean | null
}

/** An entrance found by the editor's search: on a territory of the editor's type already, or free. */
export interface EditorSearchResult extends EditorEntrance {
  otherTerritory: { id: number; number: string } | null
}
