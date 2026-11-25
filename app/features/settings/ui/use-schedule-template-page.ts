import { useEffect, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import * as m from '~/i18n/paraglide/messages'
import type { ItemKind, PartDraft } from './ScheduleTemplateItemList'

/** The item open at the panel's second level: one of the template's, or a new one (`id: null`). */
export interface OpenItem {
  kind: ItemKind
  id: number | null
  /** A new part's section and place, from where it was added. */
  draft?: PartDraft
}

/** A new part's starting point in the address: kept by a reload, dropped with the item. */
const DRAFT_PARAMS = ['section', 'order'] as const

const ITEM = /^(part|service)-(\d+)$/
const NEW_ITEM = /^new-(part|service)$/

/** The item the address opens: one of the template's (`part-12`), or a new one with its starting point. */
export function readItem(params: URLSearchParams): OpenItem | null {
  const value = params.get('item')
  const existing = value?.match(ITEM)
  if (existing) return { kind: existing[1] as ItemKind, id: Number(existing[2]) }
  const fresh = value?.match(NEW_ITEM)
  if (!fresh) return null
  const order = Number(params.get('order'))
  const draft =
    params.get('order') != null && params.get('order') !== '' && Number.isFinite(order)
      ? { section: params.get('section') ?? '', order }
      : undefined
  return { kind: fresh[1] as ItemKind, id: null, draft }
}

/**
 * Réglages › « Modèles de planning » keeps what is open in the address, so a reload stays on it and the browser's Back
 * goes up one level: `?template=3` opens a template's panel, `&item=part-12` (or `new-part`) one of its items in the
 * same panel. Entering an item adds a history entry; leaving it goes back through that entry, or drops the parameter
 * when the page was opened on it. Leaving unsaved changes inside the app asks first, browser Back included (a reload
 * or closing the tab does not).
 */
export function useScheduleTemplatePage({
  templateIds,
  itemExists,
  dirty,
}: {
  templateIds: number[]
  /** Whether the template open holds this item (a new one: whether it takes its sort). One deleted while open closes it. */
  itemExists: (item: OpenItem, templateId: number) => boolean
  /** Unsaved changes on the level open: its name and responsible, or the item's form. */
  dirty: boolean
}) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [pending, setPending] = useState<(() => void) | null>(null)
  // Bumped by a discard: the panel starts again from what is stored, even when nothing in the address changes.
  const [resetKey, setResetKey] = useState(0)
  // Leaving after a save or a delete, or once the person chose to discard: the next navigation goes through.
  const pass = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes the pass once the address has changed
  useEffect(() => {
    pass.current = false
  }, [location.key])

  const asked = Number(params.get('template'))
  const templateId = templateIds.includes(asked) ? asked : null
  const askedItem = templateId == null ? null : readItem(params)
  const item = askedItem != null && templateId != null && itemExists(askedItem, templateId) ? askedItem : null
  // An item the address names that is no longer there (deleted, here or elsewhere): back to the first level.
  const stale = askedItem != null && item == null
  // The item last shown: one that goes while shown was being edited; one asked by a stale address never was.
  const shown = useRef<string | null>(null)
  if (item != null) shown.current = params.get('item')
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the item goes, with the address of then
  useEffect(() => {
    if (!stale) return
    // Not after this page's own delete, which leaves first: the item went elsewhere, unsaved changes with it.
    if (!pass.current && askedItem?.id != null && shown.current === params.get('item')) {
      // One id: React's development double run shows it once.
      toast.error(m.settings_schedule_templates_item_gone(), { id: 'schedule-template-item-gone' })
    }
    pass.current = true
    setParams(
      prev => {
        prev.delete('item')
        for (const name of DRAFT_PARAMS) prev.delete(name)
        return prev
      },
      { preventScrollReset: true, replace: true },
    )
  }, [stale])
  // Changes count while a template is open: a panel closed with them discarded leaves none behind.
  const unsaved = dirty && templateId != null

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      unsaved &&
      !pass.current &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  )

  const guard = (run: () => void) => (unsaved ? setPending(() => run) : run())
  const keep = { preventScrollReset: true }

  return {
    templateId,
    item,
    resetKey,
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
              prev.set('order', String(next.draft.order))
            }
            return prev
          },
          { ...keep, state: { level: 'item' } },
        ),
      ),
    /** Another of the template's items in place of the one open (« 4 sur 16 »): « ← » still goes back to the list. */
    walkItem: (next: OpenItem) =>
      guard(() =>
        setParams(
          prev => {
            prev.set('item', next.id == null ? `new-${next.kind}` : `${next.kind}-${next.id}`)
            for (const name of DRAFT_PARAMS) prev.delete(name)
            return prev
          },
          { ...keep, replace: true, state: location.state },
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
        // Browser Back while the dialog was open: that navigation is the one going ahead.
        const run = blocker.state === 'blocked' ? null : pending
        setPending(null)
        pass.current = true
        setResetKey(current => current + 1)
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
