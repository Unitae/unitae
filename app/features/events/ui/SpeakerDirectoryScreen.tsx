import { Mic, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import type { SpeakerDirectory, SpeakerVisits } from '~/features/events/model/external-speaker.type'
import {
  buildSpeakerGroups,
  type SpeakerFilters,
  type SpeakerSort,
  type SpeakerView,
  speakerCounts,
} from '~/features/events/model/speaker-directory'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { EmptyState } from '~/shared/ui/EmptyState'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { listWalk } from '~/shared/ui/hooks/side-editor-walk'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'
import { sidePanelWalk } from '~/shared/ui/ListWithPanel'
import { PageTopbar } from '~/shared/ui/PageTopbar'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { NewSpeakerCongregationDialog } from './NewSpeakerCongregationDialog'
import { SpeakerCongregationPanel } from './SpeakerCongregationPanel'
import { SpeakerCreateActions } from './SpeakerCreateActions'
import { SpeakerDirectoryTable } from './SpeakerDirectoryTable'
import { SpeakerListsTabs } from './SpeakerListsTabs'
import { SpeakerPanel } from './SpeakerPanel'

// The visiting speakers we receive, grouped by the congregation whose list they are on. A row opens the speaker
// beside the list (from 1280 px) or in a sheet; a congregation's name opens the congregation. What is open lives in
// the address (?speaker=…, ?congregation=…, ?new), so a reload or a shared link comes back to it.

const DOCKED = '(min-width: 1280px)'
const SORTS: SpeakerSort[] = ['name', 'last-visit', 'next-visit']
const SORT_LABEL: Record<SpeakerSort, () => string> = {
  name: m.external_speakers_sort_name,
  'last-visit': m.external_speakers_sort_last_visit,
  'next-visit': m.external_speakers_sort_next_visit,
}

export interface SpeakerDirectoryPage {
  directory: SpeakerDirectory
  /** How many brothers are on the list we send, for its tab. */
  ourCount: number
  /** The open speaker's visits, loaded with the page. */
  visits: SpeakerVisits | null
  timezone: string
  canManage: boolean
}

type Target = { speaker: number } | { congregation: number } | { new: number | null } | null

const PANEL_PARAMS = ['speaker', 'congregation', 'new', 'edit'] as const

/** The list's filters, each kept in the address under its own name. */
function filterFields(): FilterField[] {
  return [
    {
      param: 'record',
      label: m.external_speakers_filter_record(),
      allLabel: m.external_speakers_filter_record_all(),
      options: [{ value: 'incomplete', label: m.external_speakers_filter_record_incomplete() }],
    },
    {
      param: 'list',
      label: m.external_speakers_filter_list(),
      allLabel: m.external_speakers_filter_list_all(),
      options: [{ value: 'stale', label: m.external_speakers_filter_list_stale() }],
    },
    {
      param: 'visits',
      label: m.external_speakers_filter_visits(),
      allLabel: m.external_speakers_filter_visits_all(),
      options: [
        { value: 'never', label: m.external_speakers_filter_visits_never() },
        { value: 'soon', label: m.external_speakers_filter_visits_soon() },
      ],
    },
  ]
}

function filtersFrom(params: URLSearchParams): SpeakerFilters {
  const visits = params.get('visits')
  return {
    ...(params.get('record') === 'incomplete' ? { record: 'incomplete' as const } : {}),
    ...(params.get('list') === 'stale' ? { list: 'stale' as const } : {}),
    ...(visits === 'never' || visits === 'soon' ? { visits } : {}),
  }
}

export function SpeakerDirectoryScreen({ page }: { page: SpeakerDirectoryPage }) {
  const { directory, visits, timezone, canManage } = page
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const docked = useMediaQuery(DOCKED) === true
  const trigger = useRef<HTMLElement | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState<{ next: Target } | null>(null)
  const [newCongregation, setNewCongregation] = useState(false)

  const view: SpeakerView = params.get('view') === 'retired' ? 'retired' : 'list'
  const sort: SpeakerSort = SORTS.find(each => each === params.get('sort')) ?? 'name'
  const query = params.get('q') ?? ''
  const fields = filterFields()
  const filters = filtersFrom(params)
  const chips = activeFilterChips(fields, params)

  const speakerId = Number(params.get('speaker')) || null
  const congregationId = Number(params.get('congregation')) || null
  const creating = params.has('new') && canManage
  const speaker = speakerId == null ? null : (directory.speakers.find(each => each.id === speakerId) ?? null)
  const congregation =
    congregationId == null ? null : (directory.congregations.find(each => each.id === congregationId) ?? null)

  const go = useCallback(
    (target: Target, replace = false) => {
      setParams(
        previous => {
          for (const name of PANEL_PARAMS) previous.delete(name)
          if (target == null) return previous
          if ('speaker' in target) previous.set('speaker', String(target.speaker))
          else if ('congregation' in target) previous.set('congregation', String(target.congregation))
          else previous.set('new', target.new == null ? '' : String(target.new))
          return previous
        },
        { preventScrollReset: true, replace },
      )
    },
    [setParams],
  )
  const select = (target: Target) => {
    if (dirty) setPending({ next: target })
    else go(target)
  }

  // The address names something the page no longer has (deleted, or another congregation's link): it stops naming it.
  const missing = (speakerId != null && speaker == null) || (congregationId != null && congregation == null)
  useEffect(() => {
    if (missing) go(null, true)
  }, [missing, go])

  const setParam = (name: string, value: string | null) =>
    setParams(
      previous => {
        if (value == null) previous.delete(name)
        else previous.set(name, value)
        return previous
      },
      { replace: true, preventScrollReset: true },
    )

  const counts = speakerCounts(directory)
  const groups = buildSpeakerGroups(directory, { view, query, sort, filters })
  const panelOpen = speaker != null || congregation != null || creating
  const speakerCongregation =
    speaker?.speakerCongregationId == null
      ? null
      : (directory.congregations.find(each => each.id === speaker.speakerCongregationId) ?? null)

  // ↑ ↓ walk the speakers in the order the list shows them, asking first while the form holds changes.
  const walk = speaker
    ? listWalk(
        groups.flatMap(group => group.speakers.map(each => each.id)),
        speaker.id,
        id => select({ speaker: id }),
      )
    : null

  const panel = speaker ? (
    <SpeakerPanel
      key={`speaker-${speaker.id}`}
      walk={sidePanelWalk(walk, {
        previous: m.external_speakers_panel_previous(),
        next: m.external_speakers_panel_next(),
      })}
      speaker={speaker}
      congregation={speakerCongregation}
      congregations={directory.congregations}
      visits={visits}
      defaultCongregationId={null}
      timezone={timezone}
      canManage={canManage}
      docked={docked}
      startEditing={params.has('edit')}
      returnFocus={trigger.current}
      onClose={() => select(null)}
      onOpenCongregation={id => select({ congregation: id })}
      onCreated={id => go({ speaker: id })}
      onDirtyChange={setDirty}
    />
  ) : creating ? (
    <SpeakerPanel
      key="speaker-new"
      speaker={null}
      congregation={null}
      congregations={directory.congregations}
      visits={null}
      defaultCongregationId={Number(params.get('new')) || null}
      timezone={timezone}
      canManage={canManage}
      docked={docked}
      startEditing
      returnFocus={trigger.current}
      onClose={() => select(null)}
      onOpenCongregation={id => select({ congregation: id })}
      onCreated={id => go({ speaker: id })}
      onDirtyChange={setDirty}
    />
  ) : congregation ? (
    <SpeakerCongregationPanel
      key={`congregation-${congregation.id}`}
      congregation={congregation}
      speakerCount={{
        onList: directory.speakers.filter(s => s.speakerCongregationId === congregation.id && s.retiredAt == null)
          .length,
        all: directory.speakers.filter(s => s.speakerCongregationId === congregation.id).length,
      }}
      timezone={timezone}
      canManage={canManage}
      docked={docked}
      returnFocus={trigger.current}
      onClose={() => select(null)}
      onDirtyChange={setDirty}
    />
  ) : null

  const empty = directory.speakers.length === 0 && directory.congregations.length === 0
  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked panel can stick.
    <div data-sticky-content="" className="flex flex-col gap-5">
      <PageTopbar
        trail={[{ label: m.external_speakers_page_title() }]}
        className="mb-0"
        actions={
          canManage && (
            <SpeakerCreateActions
              onNewSpeaker={() => select({ new: null })}
              onNewCongregation={() => setNewCongregation(true)}
            />
          )
        }
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <h1 className="text-h1">{m.external_speakers_page_title()}</h1>
          <span className="text-faint tabular-nums">
            {m.external_speakers_count({ count: counts.onList })} ·{' '}
            {m.external_speakers_congregations({ count: counts.congregations })}
          </span>
        </div>
      </PageTopbar>
      <SpeakerListsTabs received={counts.onList} ours={page.ourCount} />

      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {empty ? (
            <EmptyState
              icon={Mic}
              title={m.external_speakers_empty_title()}
              description={m.external_speakers_empty_description()}
              action={
                canManage ? (
                  <Button size="sm" onClick={() => setNewCongregation(true)}>
                    <Plus aria-hidden="true" />
                    {m.external_speakers_new_congregation()}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-56 flex-1 sm:max-w-80">
                  <SearchInput placeholder={m.external_speakers_search_placeholder()} />
                </div>
                <QuickViews
                  label={m.external_speakers_views_label()}
                  value={view}
                  onChoose={next => setParam('view', next === 'list' ? null : next)}
                  views={[
                    { value: 'list', label: m.external_speakers_view_on_list(), count: counts.onList },
                    { value: 'retired', label: m.external_speakers_view_retired(), count: counts.retired },
                  ]}
                />
                <FiltersPopover fields={fields} />
                <span className="flex-1" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {m.external_speakers_sort_label({ by: SORT_LABEL[sort]() })}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup
                      value={sort}
                      onValueChange={next => setParam('sort', next === 'name' ? null : next)}
                    >
                      {SORTS.map(each => (
                        <DropdownMenuRadioItem key={each} value={each}>
                          {SORT_LABEL[each]()}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {chips.length > 0 && <FilterChipBar chips={chips} clearParams={fields.map(field => field.param)} />}
              {groups.length === 0 ? (
                <p className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
                  {query || chips.length > 0
                    ? m.external_speakers_no_match()
                    : view === 'retired'
                      ? m.external_speakers_none_retired()
                      : m.external_speakers_none_on_list()}
                </p>
              ) : (
                <SpeakerDirectoryTable
                  groups={groups}
                  view={view}
                  wide={!(docked && panelOpen)}
                  selectedSpeakerId={speaker?.id ?? null}
                  selectedCongregationId={congregation?.id ?? null}
                  canManage={canManage}
                  timezone={timezone}
                  onOpenSpeaker={(next, element) => {
                    trigger.current = element
                    select(next.id === speaker?.id ? null : { speaker: next.id })
                  }}
                  onOpenCongregation={(id, element) => {
                    trigger.current = element
                    select(id === congregation?.id ? null : { congregation: id })
                  }}
                />
              )}
              <p className="text-faint max-w-3xl text-sm">{m.external_speakers_list_why()}</p>
            </>
          )}
        </div>
        {docked && panel != null && (
          // `contents` keeps the panel a flex item of the row while its key presses reach the walk.
          // biome-ignore lint/a11y/noStaticElementInteractions: the keys belong to the focusable panel inside
          <div className="contents" onKeyDown={walk?.onKeyDown}>
            {panel}
          </div>
        )}
      </div>
      {!docked && panel}

      {newCongregation && (
        <NewSpeakerCongregationDialog
          onOpenChange={setNewCongregation}
          onCreated={(id, next) => {
            setNewCongregation(false)
            if (next === 'update') navigate(`/programs/external-speakers/congregations/${id}/update`)
            else go({ congregation: id })
          }}
        />
      )}
      <DiscardChangesDialog
        open={pending != null}
        onStay={() => setPending(null)}
        onDiscard={() => {
          go(pending?.next ?? null)
          setPending(null)
          setDirty(false)
        }}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
    </div>
  )
}
