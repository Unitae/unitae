import { useEffect, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router'
import type { ItemKind, PartDraft } from './ScheduleTemplateItemList'

/** The item open at the panel's second level: one of the template's, or a new one (`id: null`). */
export interface OpenItem {
  kind: ItemKind
  id: number | null
  /** A new part's section, hall and place, from where it was added. */
  draft?: PartDraft
}

/** A new part's starting point in the address: kept by a reload, dropped with the item. */
const DRAFT_PARAMS = ['section', 'hall', 'hallOrder', 'order'] as const

const ITEM = /^(part|service)-(\d+)$/
const NEW_ITEM = /^new-(part|service)$/

function readItem(params: URLSearchParams): OpenItem | null {
  const value = params.get('item')
  const existing = value?.match(ITEM)
  if (existing) return { kind: existing[1] as ItemKind, id: Number(existing[2]) }
  const fresh = value?.match(NEW_ITEM)
  if (!fresh) return null
  const order = Number(params.get('order'))
  const hallOrder = Number(params.get('hallOrder'))
  const draft =
    params.has('order') && Number.isFinite(order)
      ? {
          section: params.get('section') ?? '',
          track: params.get('hall') ?? '',
          trackOrder: params.has('hallOrder') && Number.isFinite(hallOrder) ? hallOrder : null,
          order,
        }
      : undefined
  return { kind: fresh[1] as ItemKind, id: null, draft }
}

/**
 * Réglages › « Modèles de planning » keeps what is open in the address, so a reload stays on it and the browser's Back
 * goes up one level: `?template=3` opens a template's panel, `&item=part-12` (or `new-part`) one of its items in the
 * same panel. Entering an item adds a history entry; leaving it goes back through that entry, or drops the parameter
 * when the page was opened on it. Every way out of unsaved changes asks first, browser Back included.
 */
export function useScheduleTemplatePage({
  templateIds,
  itemExists,
  dirty,
}: {
  templateIds: number[]
  /** Whether the template open holds this item: one deleted while open closes it. */
  itemExists: (item: OpenItem) => boolean
  /** Unsaved changes on the level open: its name and responsible, or the item's form. */
  dirty: boolean
}) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [pending, setPending] = useState<(() => void) | null>(null)
  // Leaving after a save or a delete, or once the person chose to discard: the next navigation goes through.
  const pass = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes the pass once the address has changed
  useEffect(() => {
    pass.current = false
  }, [location.key])

  const asked = Number(params.get('template'))
  const templateId = templateIds.includes(asked) ? asked : null
  const askedItem = templateId == null ? null : readItem(params)
  const item = askedItem != null && (askedItem.id == null || itemExists(askedItem)) ? askedItem : null

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !pass.current &&
      pending == null &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  )

  const guard = (run: () => void) => (dirty ? setPending(() => run) : run())
  const keep = { preventScrollReset: true }

  return {
    templateId,
    item,
    /** Opens a template's panel (its first level), or closes the panel with `null`. */
    open: (id: number | null) => guard(() => setParams(id == null ? {} : { template: String(id) }, keep)),
    /** Enters one of the template's items, or a new one. */
    openItem: (next: OpenItem) =>
      guard(() =>
        setParams(
          prev => {
            prev.set('item', next.id == null ? `new-${next.kind}` : `${next.kind}-${next.id}`)
            for (const name of DRAFT_PARAMS) prev.delete(name)
            if (next.draft != null) {
              prev.set('section', next.draft.section)
              prev.set('hall', next.draft.track)
              if (next.draft.trackOrder != null) prev.set('hallOrder', String(next.draft.trackOrder))
              prev.set('order', String(next.draft.order))
            }
            return prev
          },
          { ...keep, state: { level: 'item' } },
        ),
      ),
    /** Back to the template's first level; asks first while the item holds unsaved changes. */
    back: () => guard(leaveItem),
    /** Back without asking: after the item was saved or deleted, nothing is lost. */
    leaveItem,
    /** The dialog asking before unsaved changes are dropped: from the page's own buttons, or the browser's. */
    discard: {
      open: pending != null || blocker.state === 'blocked',
      onStay: () => {
        setPending(null)
        if (blocker.state === 'blocked') blocker.reset()
      },
      onDiscard: () => {
        const run = pending
        setPending(null)
        pass.current = true
        if (blocker.state === 'blocked') blocker.proceed()
        else run?.()
      },
    },
  }

  function leaveItem() {
    pass.current = true
    if ((location.state as { level?: string } | null)?.level === 'item') {
      navigate(-1)
      return
    }
    setParams(
      prev => {
        prev.delete('item')
        for (const name of DRAFT_PARAMS) prev.delete(name)
        return prev
      },
      { ...keep, replace: true },
    )
  }
}
