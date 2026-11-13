import { SaveBar } from '@unitae/ui'
import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import { contentOf, type Draft, type DraftChange, pinState } from '~/features/territories/model/territory-draft'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { cn } from '~/shared/utils/utils'
import { EditorEntranceCard } from './EditorEntranceCard'
import { contentText, entrancesCount } from './editor-labels'
import type { MapEntrance } from './editor-map-entrance'

/** The picked entrance's card, wired to the draft. */
export function SelectedCard({
  entrance,
  draft,
  kind,
  change,
  undo,
  close,
}: {
  entrance: MapEntrance
  draft: Draft
  kind: TerritoryKindKey
  change: (next: DraftChange) => void
  undo: (id: number) => void
  close: () => void
}) {
  const other = entrance.otherTerritory
  return (
    <EditorEntranceCard
      entrance={entrance}
      change={draft.get(entrance.id) ?? null}
      pin={pinState(entrance.id, entrance.standing, draft)}
      kind={kind}
      onAdd={() => change({ kind: 'add', entrance })}
      onRemove={() => change({ kind: 'remove', entrance })}
      onTake={() => other != null && change({ kind: 'take', entrance, from: other })}
      onUndo={() => undo(entrance.id)}
      onClose={close}
    />
  )
}

/** A refused save: what happened, and a button to take back each entrance another territory now holds. */
export function RefusalBanner({
  message,
  taken,
  onDrop,
}: {
  message: string | undefined
  taken: { id: number; address: string }[]
  onDrop: (id: number) => void
}) {
  if (message == null && taken.length === 0) return null
  return (
    <div
      role="alert"
      className="mx-4 mt-3 flex flex-col gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm leading-relaxed"
    >
      {message != null && <span>{message}</span>}
      {taken.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {taken.map(entrance => (
            <Button key={entrance.id} type="button" variant="outline" size="sm" onClick={() => onDrop(entrance.id)}>
              {m.territory_editor_drop({ address: entrance.address })}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/** What the form posts beside its fields: the entrances the territory will hold, and the ones taken. */
export function SubmissionInputs({
  submission,
}: {
  submission: { entranceIds: number[]; reassignments: { entranceId: number; fromTerritoryId: number }[] }
}) {
  return (
    <>
      {submission.entranceIds.map(id => (
        <input key={id} type="hidden" name="entrances" value={id} />
      ))}
      {submission.reassignments.map((reassignment, index) => (
        <span key={reassignment.entranceId} className="contents">
          <input type="hidden" name={`reassignments[${index}].entranceId`} value={reassignment.entranceId} />
          <input type="hidden" name={`reassignments[${index}].fromTerritoryId`} value={reassignment.fromTerritoryId} />
        </span>
      ))}
    </>
  )
}

interface EditorSaveBarProps {
  /** Under the column beside the map; across the content area when there is no map. */
  beside: boolean
  mode: 'new' | 'edit'
  formId: string
  changes: number
  kind: TerritoryKindKey
  kept: EditorEntrance[]
  cancelTo: string
}

/**
 * The save bar: at the bottom of the column on a wide screen, above the tab bar on a phone (so that it stays while
 * the map takes the screen). Editing, it counts the changes; creating, it says what the territory will hold.
 */
export function EditorSaveBar({ beside, mode, formId, changes, kind, kept, cancelTo }: EditorSaveBarProps) {
  const editing = mode === 'edit'
  return (
    <SaveBar
      aria-label={m.territory_editor_save_bar()}
      dirty={editing && changes > 0}
      label={editing ? changesLabel(changes) : contentLabel(kind, kept)}
      className={cn(
        // At the bottom of the screen: the editor hides the tab bar on a phone.
        'fixed z-30 max-md:inset-x-0 max-md:bottom-0 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-0',
        beside
          ? 'md:right-0 md:w-100 md:border-l'
          : 'md:inset-x-0 md:group-has-data-[state=expanded]/sidebar-wrapper:left-(--sidebar-width)',
      )}
    >
      <Button asChild variant="ghost">
        <Link to={cancelTo}>{m.common_cancel()}</Link>
      </Button>
      <SubmitButton form={formId} disabled={editing && changes === 0}>
        {editing ? m.common_save() : m.territories_form_create_submit()}
      </SubmitButton>
    </SaveBar>
  )
}

function changesLabel(changes: number): string | undefined {
  if (changes === 0) return undefined
  return m.territory_editor_changes_count({ count: changes })
}

function contentLabel(kind: TerritoryKindKey, kept: EditorEntrance[]): string {
  if (kept.length === 0) return m.territory_editor_no_entrance()
  return m.territory_editor_new_summary({
    entrances: entrancesCount(kept.length),
    content: contentText(kind, contentOf(kind, kept)),
  })
}

export function emptyText(mode: 'new' | 'edit', hadEntrances: boolean, hasMap: boolean, number: string): string {
  if (mode === 'edit' && hadEntrances) return m.territory_editor_empty_edit({ number })
  return hasMap ? m.territory_editor_empty_new() : m.territory_editor_empty_search()
}

/** The zone API's address: the territory's view of the map when editing, its type's when creating. */
export function bboxUrl(
  bbox: { swLat: number; swLng: number; neLat: number; neLng: number },
  territoryId: number | null,
  kind: TerritoryKindKey,
): string {
  const params = new URLSearchParams({ bbox: `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}` })
  if (territoryId != null) params.set('territoryId', String(territoryId))
  else {
    params.set('mode', 'new')
    params.set('kind', kind)
  }
  return `/territories/api/entrances-in-bbox?${params.toString()}`
}

/** Where the map starts on a phone's page, so that it takes the height left above the save bar and the tab bar. */
export function useTopOnPhone(active: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!active) return
    const measure = () => {
      if (ref.current != null) setTop(ref.current.getBoundingClientRect().top + window.scrollY)
    }
    // From the top of the page: a list scrolled down would otherwise shorten the map.
    window.scrollTo(0, 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active])
  return { ref, top }
}
