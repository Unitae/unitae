import { SegmentedControl } from '@unitae/ui'
import { type CSSProperties, useId } from 'react'
import { Form } from 'react-router'

import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { cn } from '~/shared/utils/utils'
import { EditorColumnHeader } from './EditorColumnHeader'
import { EditorChanges, EditorEntranceList } from './EditorEntranceList'
import { EditorLegend } from './EditorLegend'
import { EditorMap } from './EditorMap'
import { EditorSearch } from './EditorSearch'
import {
  bboxUrl,
  EditorSaveBar,
  emptyText,
  RefusalBanner,
  SelectedCard,
  SubmissionInputs,
  useTopOnPhone,
} from './editor-parts'
import { useTerritoryEditor } from './use-territory-editor'

/** What the editor's action answers when it refuses a save; the changes stay on the page. */
export interface EditorActionData {
  numberError?: string
  formError?: string
  taken?: { id: number; address: string; territoryNumber: string }[]
}

interface TerritoryEditorProps {
  mode: 'new' | 'edit'
  territory: { id: number | null; number: string; type: TerritoryKindKey; notes: string }
  saved: EditorEntrance[]
  /** The types a new territory can take. */
  kinds: TerritoryKindKey[]
  apiKey: string | null
  center: { lat: number; lng: number } | null
  cancelTo: string
  result: EditorActionData | undefined
}

/** On a phone the map fills what is left above the save bar and the tab bar. */
const PHONE_MAP = 'h-[calc(100dvh-var(--map-top,16rem)-8rem-env(safe-area-inset-bottom))] min-h-72'

/**
 * The territory editor, for creation and edition alike: the map on the left, the territory's column on the right,
 * the save bar at the bottom of the column. On a phone, « Carte » and « Entrées » take the screen in turn.
 */
export function TerritoryEditor(props: TerritoryEditorProps) {
  const { mode, territory, saved, kinds, apiKey, center, cancelTo, result } = props
  const formId = useId()
  const editor = useTerritoryEditor({ mode, territory, saved, refused: result?.taken ?? [] })
  const { draft, kind, selected } = editor
  const mapShown = apiKey != null && editor.view === 'map'
  const { ref: mapRef, top } = useTopOnPhone(mapShown)

  return (
    <div
      data-full-bleed=""
      className="flex flex-col max-md:-mx-4 md:-mx-6 md:-mt-6 md:-mb-6 md:h-[calc(100dvh-3rem)] md:flex-row"
    >
      <UnsavedChangesDialog blocker={editor.blocker} />
      {apiKey != null && (
        <>
          <div className="border-border border-b px-4 pb-3 md:hidden">
            <SegmentedControl
              aria-label={m.territory_editor_views()}
              value={editor.view}
              onValueChange={editor.setView}
              className="w-full"
              options={[
                { value: 'map', label: m.territory_editor_view_map() },
                { value: 'list', label: `${m.territory_editor_view_list()} ${editor.kept.length}` },
              ]}
            />
          </div>
          <div
            ref={mapRef}
            style={top == null ? undefined : ({ '--map-top': `${top}px` } as CSSProperties)}
            className={cn('min-w-0 md:h-full md:flex-1', mapShown ? PHONE_MAP : 'max-md:hidden')}
          >
            <EditorMap
              apiKey={apiKey}
              className="size-full"
              label={territoryMapLabel(mode, territory.number)}
              bboxUrl={bbox => bboxUrl(bbox, territory.id, kind)}
              own={editor.own}
              draft={draft}
              center={center}
              selectedId={selected?.id ?? null}
              hotId={editor.hotId}
              focus={editor.focus}
              hint={mode === 'new' && draft.size === 0 ? m.territory_editor_map_hint_new() : null}
              legend={<EditorLegend mode={mode} number={territory.number} />}
              card={
                selected && (
                  <SelectedCard
                    key={selected.id}
                    entrance={selected}
                    draft={draft}
                    kind={kind}
                    change={editor.change}
                    undo={editor.undo}
                    close={editor.close}
                  />
                )
              }
              onSelect={editor.setSelected}
              onHover={editor.setHotId}
            />
          </div>
        </>
      )}

      <div
        className={cn(
          'flex min-h-0 flex-col bg-surface md:border-border',
          // Beside the map, a column; without one, the page's readable measure.
          apiKey != null ? 'md:w-100 md:shrink-0 md:border-l' : 'md:mx-auto md:w-full md:max-w-2xl md:border-x',
          mapShown && 'max-md:hidden',
        )}
      >
        <Form method="post" id={formId} className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-20">
          <EditorColumnHeader
            mode={mode}
            number={editor.number}
            onNumber={editor.setNumber}
            numberError={result?.numberError ?? null}
            kind={kind}
            kinds={kinds}
            onKind={editor.changeKind}
            notes={editor.notes}
            onNotes={editor.setNotes}
            content={editor.content}
            entrances={editor.kept.length}
            streets={editor.streets}
          />
          <RefusalBanner message={result?.formError} taken={editor.taken} onDrop={editor.undo} />
          {apiKey == null && (
            <EditorSearch
              kind={kind}
              territoryId={territory.id}
              draft={draft}
              onAdd={entrance => editor.change({ kind: 'add', entrance })}
              onTake={(entrance, from) => editor.change({ kind: 'take', entrance, from })}
            />
          )}
          <EditorEntranceList
            groups={editor.groups}
            creating={mode === 'new'}
            kind={kind}
            count={editor.kept.length}
            selectedId={selected?.id ?? null}
            hotId={editor.hotId}
            empty={emptyText(mode, saved.length > 0, apiKey != null, territory.number)}
            onPick={editor.pick}
            onHover={editor.setHotId}
            onRemove={entrance => editor.change({ kind: 'remove', entrance })}
            onUndo={editor.undo}
          />
          <EditorChanges draft={draft} kind={kind} onUndoAll={editor.reset} />
          <SubmissionInputs submission={editor.submission} />
        </Form>
      </div>

      <EditorSaveBar
        beside={apiKey != null}
        mode={mode}
        formId={formId}
        changes={editor.changes}
        kind={kind}
        kept={editor.kept}
        cancelTo={cancelTo}
      />
    </div>
  )
}

function territoryMapLabel(mode: 'new' | 'edit', number: string): string {
  return mode === 'edit' ? m.territory_editor_map_label({ number }) : m.territory_editor_map_label_new()
}
