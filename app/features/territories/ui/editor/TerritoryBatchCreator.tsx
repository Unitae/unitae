import { SaveBar, SegmentedControl } from '@unitae/ui'
import { Loader2 } from 'lucide-react'
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'

import type { EditorEntrance } from '~/features/territories/model/editor-entrance.type'
import { contentOf } from '~/features/territories/model/territory-draft'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { cn } from '~/shared/utils/utils'
import { freshFetcherData } from '../fresh-fetcher-data'
import { BatchColumnHeader } from './BatchColumnHeader'
import { BatchLegend, CreatedList, type CreatedTerritory, NothingFree, WithoutPositionList } from './batch-parts'
import { EditorEntranceList } from './EditorEntranceList'
import { EditorMap } from './EditorMap'
import { EditorSearch } from './EditorSearch'
import { contentText, entrancesCount } from './editor-labels'
import { RefusalBanner, SelectedCard, SubmissionInputs, useTopOnPhone } from './editor-parts'
import { useTerritoryBatch } from './use-territory-batch'

/** What the bulk tool's action answers: the territory made and the next number, or why it refused. */
export interface BatchActionData {
  created?: { id: number; number: string }
  /** The next free number of the type: after a creation, or after a refusal because the number was just taken. */
  nextNumber?: string
  numberError?: string
  formError?: string
  taken?: { id: number; address: string; territoryNumber: string }[]
}

interface TerritoryBatchCreatorProps {
  kind: TerritoryKindKey
  kinds: { kind: TerritoryKindKey; free: number }[]
  free: number
  withoutPosition: { entrances: EditorEntrance[]; total: number }
  suggestedNumber: string
  zips: string[]
  /** The filters as the zone API reads them (`zip`, `access`, `street`). */
  filters: URLSearchParams
  apiKey: string | null
  center: { lat: number; lng: number } | null
  created: CreatedTerritory[]
  onCreated: (territory: CreatedTerritory) => void
}

const PHONE_MAP = 'h-[calc(100dvh-var(--map-top,16rem)-8rem-env(safe-area-inset-bottom))] min-h-72'

/**
 * « Créer en lot »: the editor's create screen that chains territories. The map shows the free entrances of the type;
 * the column holds the next territory, the filters and « Créés ici ». After each
 * creation the page stays: the selection starts again with the next number.
 */
export function TerritoryBatchCreator(props: TerritoryBatchCreatorProps) {
  const { kind, free, withoutPosition, apiKey, filters } = props
  const formId = useId()
  const filterKey = filters.toString()
  const batch = useTerritoryBatch({ kind, suggestedNumber: props.suggestedNumber, filterKey })
  const { draft, selected } = batch
  const fetcher = useFetcher<BatchActionData>()
  const [showWithoutPosition, setShowWithoutPosition] = useState(false)
  const mapShown = apiKey != null && batch.view === 'map'
  const summary = summaryOf(kind, batch.kept)

  const zoneUrl = useCallback(
    (bbox: { swLat: number; swLng: number; neLat: number; neLng: number }) => {
      const params = new URLSearchParams(filterKey)
      params.set('mode', 'create')
      params.set('kind', kind)
      params.set('bbox', `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}`)
      return `/territories/api/entrances-in-bbox?${params.toString()}`
    },
    [kind, filterKey],
  )

  const { restart } = batch
  const refusal = useBatchAnswers(fetcher, summary, props.onCreated, restart)

  const busy = fetcher.state !== 'idle'
  return (
    <div
      data-full-bleed=""
      className="flex flex-col max-md:-mx-4 md:-mx-6 md:-mt-6 md:-mb-6 md:h-[calc(100dvh-3rem)] md:flex-row"
    >
      <UnsavedChangesDialog blocker={batch.blocker} />
      {apiKey != null && (
        <BatchMapPane batch={batch} kind={kind} free={free} apiKey={apiKey} center={props.center} zoneUrl={zoneUrl} />
      )}

      <div
        className={cn(
          'flex min-h-0 flex-col bg-surface md:border-border',
          apiKey != null ? 'md:w-100 md:shrink-0 md:border-l' : 'md:mx-auto md:w-full md:max-w-2xl md:border-x',
          mapShown && 'max-md:hidden',
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-20">
          <BatchColumnHeader
            number={batch.number}
            onNumber={batch.setNumber}
            numberError={refusal?.numberError ?? null}
            nextFree={refusal?.numberError != null ? (refusal.nextNumber ?? null) : null}
            kind={kind}
            kinds={props.kinds}
            zips={props.zips}
            free={free}
            withoutPosition={withoutPosition.total}
            showingWithoutPosition={showWithoutPosition}
            onToggleWithoutPosition={() => setShowWithoutPosition(shown => !shown)}
          />
          <RefusalBanner
            message={refusal?.formError}
            taken={(refusal?.taken ?? []).filter(entrance => draft.has(entrance.id))}
            onDrop={batch.undo}
          />
          {showWithoutPosition && withoutPosition.total > 0 && (
            <WithoutPositionList
              entrances={withoutPosition.entrances}
              total={withoutPosition.total}
              draft={draft}
              onAdd={entrance => batch.change({ kind: 'add', entrance })}
            />
          )}
          {apiKey == null && (
            <EditorSearch
              kind={kind}
              territoryId={null}
              draft={draft}
              freeOnly
              onAdd={entrance => batch.change({ kind: 'add', entrance })}
              onTake={() => {}}
            />
          )}
          {free === 0 && draft.size === 0 ? (
            <NothingFree />
          ) : (
            <EditorEntranceList
              groups={batch.groups}
              creating
              kind={kind}
              count={batch.kept.length}
              selectedId={selected?.id ?? null}
              hotId={batch.hotId}
              empty={apiKey != null ? m.split_tool_entrances_empty() : m.split_tool_entrances_empty_search()}
              onPick={batch.pick}
              onHover={batch.setHotId}
              onRemove={entrance => batch.undo(entrance.id)}
              onUndo={batch.undo}
            />
          )}
          <CreatedList created={props.created} />
        </div>
        <fetcher.Form method="post" id={formId} className="hidden">
          <input type="hidden" name="number" value={batch.number} />
          <input type="hidden" name="type" value={kind} />
          <SubmissionInputs submission={batch.submission} />
        </fetcher.Form>
      </div>

      <BatchSaveBar
        beside={apiKey != null}
        formId={formId}
        summary={summary}
        number={batch.number}
        chosen={draft.size}
        busy={busy}
        onClear={batch.reset}
      />
    </div>
  )
}

/** « 4 entrées · 42 foyers », or that none is chosen yet. */
function summaryOf(kind: TerritoryKindKey, kept: EditorEntrance[]): string {
  if (kept.length === 0) return m.territory_editor_no_entrance()
  return m.territory_editor_new_summary({
    entrances: entrancesCount(kept.length),
    content: contentText(kind, contentOf(kind, kept)),
  })
}

/**
 * Each answer of the action once: a creation tells it, joins « Créés ici » and restarts the selection; a refusal is
 * returned so the column says what to fix, the selection kept. A new submission clears the last refusal.
 */
function useBatchAnswers(
  fetcher: { state: 'idle' | 'submitting' | 'loading'; data?: BatchActionData },
  summary: string,
  onCreated: (territory: CreatedTerritory) => void,
  restart: (nextNumber: string) => void,
): BatchActionData | null {
  const [refusal, setRefusal] = useState<BatchActionData | null>(null)
  const actedOn = useRef<BatchActionData | null>(null)
  useEffect(() => {
    if (fetcher.state === 'submitting') setRefusal(null)
    const answer = freshFetcherData(fetcher.state, fetcher.data, actedOn.current)
    if (answer == null) return
    actedOn.current = answer
    if (answer.created == null) {
      setRefusal(answer)
      return
    }
    toast.success(m.split_tool_created_toast({ number: answer.created.number, summary }))
    onCreated({ ...answer.created, summary })
    restart(answer.nextNumber ?? '')
  }, [fetcher.state, fetcher.data, summary, onCreated, restart])
  return refusal
}

/** The map, and on a phone the « Carte » / « Entrées » switch above it. */
function BatchMapPane({
  batch,
  kind,
  free,
  apiKey,
  center,
  zoneUrl,
}: {
  batch: ReturnType<typeof useTerritoryBatch>
  kind: TerritoryKindKey
  free: number
  apiKey: string
  center: { lat: number; lng: number } | null
  zoneUrl: (bbox: { swLat: number; swLng: number; neLat: number; neLng: number }) => string
}) {
  const { draft, selected } = batch
  const mapShown = batch.view === 'map'
  const { ref: mapRef, top } = useTopOnPhone(mapShown)
  return (
    <>
      <div className="border-border border-b px-4 pb-3 md:hidden">
        <SegmentedControl
          aria-label={m.territory_editor_views()}
          value={batch.view}
          onValueChange={batch.setView}
          className="w-full"
          options={[
            { value: 'map', label: m.territory_editor_view_map() },
            { value: 'list', label: `${m.territory_editor_view_list()} ${batch.kept.length}` },
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
          label={m.split_tool_map_label()}
          bboxUrl={zoneUrl}
          refreshKey={batch.zoneVersion}
          own={[]}
          draft={draft}
          center={center}
          selectedId={selected?.id ?? null}
          hotId={batch.hotId}
          focus={batch.focus}
          hint={draft.size === 0 ? m.split_tool_map_hint() : null}
          legend={<BatchLegend number={batch.number} />}
          visibleOf={free}
          card={
            selected && (
              <SelectedCard
                key={selected.id}
                entrance={selected}
                draft={draft}
                kind={kind}
                change={batch.change}
                undo={batch.undo}
                close={batch.close}
              />
            )
          }
          onSelect={batch.setSelected}
          onHover={batch.setHotId}
        />
      </div>
    </>
  )
}

/** « Vider » and « Créer T16 »: at the bottom of the column, above the tab bar on a phone. */
function BatchSaveBar({
  beside,
  formId,
  summary,
  number,
  chosen,
  busy,
  onClear,
}: {
  beside: boolean
  formId: string
  summary: string
  number: string
  chosen: number
  busy: boolean
  onClear: () => void
}) {
  return (
    <SaveBar
      aria-label={m.territory_editor_save_bar()}
      dirty={false}
      label={summary}
      className={cn(
        'fixed z-30 max-md:inset-x-0 max-md:bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-0',
        beside
          ? 'md:right-0 md:w-100 md:border-l'
          : 'md:inset-x-0 md:group-has-data-[state=expanded]/sidebar-wrapper:left-(--sidebar-width)',
      )}
    >
      <Button type="button" variant="ghost" onClick={onClear} disabled={chosen === 0 || busy}>
        {m.split_tool_clear()}
      </Button>
      <Button type="submit" form={formId} disabled={chosen === 0 || number.trim() === '' || busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        {m.split_tool_create({ number: number.trim() || '…' })}
      </Button>
    </SaveBar>
  )
}
