import { type KeyboardEvent, useCallback, useState } from 'react'
import { arrowStep, isInField, stepThrough, type WalkStep } from '~/shared/ui/hooks/side-editor-walk'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'

/** From this width the editor docks beside the list; below, it opens in a sheet over the page. */
const DOCKED = '(min-width: 1280px)'

/** What the editor shows, and the button that opened it: focus goes back there on close. */
export interface SideEditorTarget<K extends string> {
  kind: K
  /** `null` while creating a new item. */
  id: number | null
  trigger: HTMLElement | null
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
 * The item open in a page's side editor: docked beside the list from 1280 px, in a sheet below. Opening another
 * item, or closing with × or Escape, asks first while the docked editor holds unsaved changes; « Annuler » is
 * `close`, which drops them. `exists` tells whether the item is still in the page's data: one deleted while open
 * closes its editor.
 */
export function useSideEditor<K extends string>(exists: (target: SideEditorTarget<K>) => boolean) {
  const docked = useMediaQuery(DOCKED) === true
  const [target, setTarget] = useState<SideEditorTarget<K> | null>(null)
  const [pending, setPending] = useState<{ next: SideEditorTarget<K> | null } | null>(null)
  const form = useFormChanges()

  const current = target != null && (target.id == null || exists(target)) ? target : null
  const dirty = current != null && docked && form.changes > 0
  const close = useCallback(() => setTarget(null), [])

  /**
   * The walk through `ids`, the items of `kind` in the order the list shows them, from the open item; `null` when
   * the open item is not among them or is alone. Each step asks first, like `request`, while changes are unsaved.
   */
  function walk(kind: K, ids: readonly number[]): SideEditorWalk | null {
    if (current == null || current.kind !== kind || current.id == null) return null
    const from = current.id
    const index = ids.indexOf(from)
    if (index < 0 || ids.length < 2) return null
    const go = (step: WalkStep) => {
      const id = stepThrough(ids, from, step)
      if (id != null) request({ kind, id, trigger: null })
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

  /** Opens another item, or closes with `null`. */
  function request(next: SideEditorTarget<K> | null) {
    const same = next != null && current != null && next.kind === current.kind && next.id === current.id
    if (dirty && !same) setPending({ next })
    else setTarget(next)
  }

  return {
    docked,
    target: current,
    /** The docked editor holds unsaved changes. */
    dirty,
    /** Give it to the docked editor's form, to count its changes. */
    formRef: form.ref,
    request,
    walk,
    /** Opens another item without asking: after the open one was saved, its changes are not lost. */
    open: setTarget,
    close,
    /** Props for the dialog asking before unsaved changes are dropped. */
    discard: {
      open: pending != null,
      onStay: () => setPending(null),
      onDiscard: () => {
        setTarget(pending?.next ?? null)
        setPending(null)
      },
    },
  }
}
