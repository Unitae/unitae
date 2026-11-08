import { useCallback, useState } from 'react'
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
