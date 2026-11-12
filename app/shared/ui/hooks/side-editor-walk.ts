import type { KeyboardEvent } from 'react'

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

/** Where the open item stands in the list, and the way to its neighbours: what `SidePanel`'s `walk` shows. */
export interface SideEditorWalk {
  /** From 1. */
  position: number
  total: number
  previous: () => void
  next: () => void
  /** On the panel, or a `contents` wrapper around it: ↑ and ↓ open the previous and next item, outside fields. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * The walk through `ids` (the list as the page shows it) from `current`; `open` opens a neighbour, asking first if the
 * page asks before dropping changes. `null` when `current` is not in the list or is alone in it.
 */
export function listWalk(ids: readonly number[], current: number, open: (id: number) => void): SideEditorWalk | null {
  const index = ids.indexOf(current)
  if (index < 0 || ids.length < 2) return null
  const go = (step: WalkStep) => {
    const id = stepThrough(ids, current, step)
    if (id != null) open(id)
  }
  return {
    position: index + 1,
    total: ids.length,
    previous: () => go(-1),
    next: () => go(1),
    onKeyDown(event) {
      const step = event.defaultPrevented ? null : arrowStep(event.key, isInField(event.target))
      if (step == null) return
      event.preventDefault()
      go(step)
    },
  }
}
