/** One item back up the list, or one down. */
export type WalkStep = -1 | 1

/**
 * The id `step` away from `id` in `ids` (the list as the page shows it), wrapping around at both ends. `null` when
 * there is nowhere to go: `id` is not in the list, or it is the only item.
 */
export function stepThrough(ids: readonly number[], id: number, step: WalkStep): number | null {
  const index = ids.indexOf(id)
  if (index < 0 || ids.length < 2) return null
  return ids[(index + step + ids.length) % ids.length] ?? null
}

/** The step an arrow key asks a panel for: ↑ back, ↓ forward, but never from inside a field (`inField`). */
export function arrowStep(key: string, inField: boolean): WalkStep | null {
  if (inField) return null
  if (key === 'ArrowUp') return -1
  if (key === 'ArrowDown') return 1
  return null
}

/** Elements where ↑ and ↓ already do something: move a caret, change a value, move through options or days. */
const FIELD =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="listbox"], [role="menu"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="radiogroup"], [role="grid"]'

/** Whether a key event comes from inside a field, which keeps its arrow keys. */
export function isInField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FIELD) != null
}
