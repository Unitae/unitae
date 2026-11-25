/** An item of a schedule template's panel: a part, or a service. */
export type ItemKind = 'part' | 'service'

/** The `data-item` mark of an item's row, where focus goes back after its form closes. */
export const itemMark = (kind: ItemKind, id: number) => `${kind}-${id}`
