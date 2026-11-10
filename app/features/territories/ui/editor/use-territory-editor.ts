import { useCallback, useEffect, useMemo, useState } from 'react'

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

export interface TerritoryEditorInput {
  mode: 'new' | 'edit'
  territory: { id: number | null; number: string; type: TerritoryKindKey; notes: string }
  saved: EditorEntrance[]
  /** The entrances a refused save named: they stay listed while they are still in the draft. */
  refused: { id: number; address: string; territoryNumber: string }[]
}

/**
 * The editor's state: the fields, the draft of entrance changes, the entrance picked on the map or in the list, the
 * one under the pointer, and what the column shows from them.
 */
export function useTerritoryEditor({ mode, territory, saved, refused }: TerritoryEditorInput) {
  const [number, setNumber] = useState(territory.number)
  const [notes, setNotes] = useState(territory.notes)
  const [kind, setKind] = useState(territory.type)
  const fieldsChanged =
    mode === 'edit' ? Number(number.trim() !== territory.number) + Number(notes !== territory.notes) : 0
  const draftState = useTerritoryDraft(fieldsChanged > 0 || (mode === 'new' && number !== ''))
  const { draft, reset } = draftState
  const [selected, setSelected] = useState<MapEntrance | null>(null)
  const [hotId, setHotId] = useState<number | null>(null)
  const [focus, setFocus] = useState<EditorMapFocus | null>(null)
  const [view, setView] = useState<'map' | 'list'>('map')
  // Bumped when the type changes: the map's zones hold another type's entrances and must be fetched again.
  const [zoneVersion, setZoneVersion] = useState(0)

  const rows = useMemo(() => draftRows(saved, draft), [saved, draft])
  const groups = useMemo(() => byStreet(rows, getLocale()), [rows])
  const kept = useMemo(() => draftEntrances(saved, draft), [saved, draft])
  const content = useMemo(() => draftContent(kind, saved, draft), [kind, saved, draft])
  const submission = useMemo(() => draftSubmission(saved, draft), [saved, draft])
  const own = useMemo(() => saved.filter(entrance => entrance.latitude != null).map(ownMapEntrance), [saved])

  // Escape closes the card, as it would a popover.
  const close = useCallback(() => setSelected(null), [])
  useEffect(() => {
    if (selected == null) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, close])

  /** A row of the list: its card opens and the map goes to it (on a phone, the map comes back). */
  const pick = (entrance: EditorEntrance) => {
    setSelected(
      own.find(candidate => candidate.id === entrance.id) ?? { ...ownMapEntrance(entrance), standing: 'available' },
    )
    setFocus(previous => ({ id: entrance.id, nonce: (previous?.nonce ?? 0) + 1 }))
    setView('map')
  }

  /** Creating: another type offers other entrances, so the ones chosen go. */
  const changeKind = (next: TerritoryKindKey) => {
    setKind(next)
    reset()
    setSelected(null)
    setZoneVersion(version => version + 1)
  }

  return {
    ...draftState,
    number,
    setNumber,
    notes,
    setNotes,
    kind,
    changeKind,
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
    groups,
    kept,
    content,
    submission,
    own,
    streets: new Set(kept.map(entrance => entrance.address.street)).size,
    changes: draft.size + fieldsChanged,
    taken: refused.filter(entrance => draft.has(entrance.id)),
  }
}
