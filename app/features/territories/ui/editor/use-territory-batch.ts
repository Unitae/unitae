import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import {
  byStreet,
  draftContent,
  draftEntrances,
  draftRows,
  draftSubmission,
} from '~/features/territories/model/territory-draft'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { getLocale } from '~/i18n/paraglide/runtime'
import type { EditorMapFocus } from './EditorMap'
import { type MapEntrance, ownMapEntrance } from './editor-map-entrance'
import { useTerritoryDraft } from './use-territory-draft'

const NONE: EditorEntrance[] = []

/**
 * The bulk creation tool's state: the next territory's number and entrances, the entrance picked on the map or in the
 * list, the one under the pointer, and when the map's zones must be fetched again. Leaving warns only while entrances
 * are chosen: the number is always filled in (the suggestion), it is not a change.
 */
export function useTerritoryBatch({
  kind,
  suggestedNumber,
  filterKey,
}: {
  kind: TerritoryKindKey
  suggestedNumber: string
  /** The filters as one string: another one fetches the zones again. */
  filterKey: string
}) {
  const [number, setNumber] = useState(suggestedNumber)
  const draftState = useTerritoryDraft(false)
  const { draft, reset } = draftState
  const [selected, setSelected] = useState<MapEntrance | null>(null)
  const [hotId, setHotId] = useState<number | null>(null)
  const [focus, setFocus] = useState<EditorMapFocus | null>(null)
  const [view, setView] = useState<'map' | 'list'>('map')
  const [zoneVersion, setZoneVersion] = useState(0)
  const refresh = useCallback(() => setZoneVersion(version => version + 1), [])

  const rows = useMemo(() => draftRows(NONE, draft), [draft])
  const groups = useMemo(() => byStreet(rows, getLocale()), [rows])
  const kept = useMemo(() => draftEntrances(NONE, draft), [draft])
  const content = useMemo(() => draftContent(kind, NONE, draft), [kind, draft])
  const submission = useMemo(() => draftSubmission(NONE, draft), [draft])

  // Escape closes the card, as it would a popover.
  const close = useCallback(() => setSelected(null), [])
  useEffect(() => {
    if (selected == null) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, close])

  // Someone else may have split meanwhile: coming back to the tab fetches the zones again.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  // Other filters, other free entrances: the zones held are dropped.
  const firstFilters = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the filters' key alone triggers it
  useEffect(() => {
    if (firstFilters.current) {
      firstFilters.current = false
      return
    }
    refresh()
  }, [filterKey])

  /** A row of the list: its card opens and the map goes to it (on a phone, the map comes back). */
  const pick = (entrance: EditorEntrance) => {
    setSelected({ ...ownMapEntrance(entrance), standing: 'available' })
    setFocus(previous => ({ id: entrance.id, nonce: (previous?.nonce ?? 0) + 1 }))
    setView('map')
  }

  /** After a creation: the selection starts again, with the next number, and the map drops the entrances taken. */
  const restart = useCallback(
    (nextNumber: string) => {
      reset()
      setSelected(null)
      setNumber(nextNumber)
      refresh()
    },
    [reset, refresh],
  )

  return {
    ...draftState,
    number,
    setNumber,
    selected,
    setSelected,
    close,
    hotId,
    setHotId,
    focus,
    view,
    setView,
    zoneVersion,
    pick,
    restart,
    groups,
    kept,
    content,
    submission,
  }
}
