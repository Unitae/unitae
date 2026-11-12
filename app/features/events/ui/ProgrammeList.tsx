import { Panel, Status } from '@unitae/ui'
import { CalendarDays, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { EventStatus } from '~/features/events/model/event-status.type'
import type { ListPeriod, PeriodPreset } from '~/features/events/model/list-period'
import type { ProgrammeRowData } from '~/features/events/model/programme-list.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { QuickViews } from '~/shared/ui/QuickViews'

import { formatDay } from './PeriodMenu'
import { ProgrammeBulkActions } from './ProgrammeBulkActions'
import { ProgrammeWeekTable } from './ProgrammeWeekTable'
import { periodWeeks, weekOf } from './period-weeks'
import { WeeksHint } from './WeeksHint'

type View = 'all' | 'drafts' | 'review'

interface ProgrammeListProps {
  programmes: ProgrammeRowData[]
  period: ListPeriod
  preset: PeriodPreset | null
  /** Whether the reader would see any programme at all, in any period. */
  hasAnyProgramme: boolean
  canCreate: boolean
  timeZone: string
  now: Date
}

/** « À revoir » keeps the old address the home page used to link to (`?hasConflicts=true`). */
function viewOf(params: URLSearchParams): View {
  const view = params.get('view')
  if (view === 'drafts' || view === 'review') return view
  return params.get('hasConflicts') === 'true' ? 'review' : 'all'
}

/**
 * The programmes of the period, week by week: « Tous », « Brouillons » and « À revoir » narrow the list in the page,
 * rows the reader may act on can be selected on a wide screen, and each empty list says why it is empty.
 */
export function ProgrammeList({
  programmes,
  period,
  preset,
  hasAnyProgramme,
  canCreate,
  timeZone,
  now,
}: ProgrammeListProps) {
  const [params, setParams] = useSearchParams()
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const view = viewOf(params)
  const drafts = programmes.filter(row => row.status === EventStatus.Draft)
  const toReview = programmes.filter(row => row.review > 0)
  const shown = view === 'drafts' ? drafts : view === 'review' ? toReview : programmes
  // A selection outlives a filter only for the rows still shown.
  const selected = shown.filter(row => picked.has(row.id))

  if (!hasAnyProgramme) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={m.programs_empty_title()}
        description={m.programs_empty_description()}
        action={canCreate ? <CreateButton /> : undefined}
      />
    )
  }

  const choose = (value: View) =>
    setParams(
      prev => {
        prev.delete('hasConflicts')
        if (value === 'all') prev.delete('view')
        else prev.set('view', value)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )
  const toggle = (ids: number[], select: boolean) =>
    setPicked(prev => {
      const next = new Set(prev)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return next
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ViewFilters
          view={view}
          counts={{ all: programmes.length, drafts: drafts.length, review: toReview.length }}
          onChoose={choose}
        />
        <span className="flex-1" />
        <WeeksHint />
      </div>
      {programmes.length === 0 ? (
        <NoneInPeriod period={period} preset={preset} canCreate={canCreate} />
      ) : shown.length === 0 ? (
        <NothingShown view={view} />
      ) : (
        <ProgrammeWeekTable
          weeks={periodWeeks(shown, period, timeZone)}
          showEmptyWeeks={view === 'all'}
          canCreate={canCreate}
          selected={picked}
          onToggle={id => toggle([id], !picked.has(id))}
          onToggleAll={toggle}
          currentWeek={weekOf(now, timeZone)}
          timeZone={timeZone}
          now={now}
        />
      )}
      {selected.length > 0 && (
        <ProgrammeBulkActions selected={selected} onClear={() => setPicked(new Set())} timeZone={timeZone} />
      )}
    </div>
  )
}

function CreateButton() {
  return (
    <Button asChild size="sm">
      <Link to="/programs/new">
        <Plus aria-hidden="true" />
        {m.programs_create_button()}
      </Link>
    </Button>
  )
}

function ViewFilters({
  view,
  counts,
  onChoose,
}: {
  view: View
  counts: Record<View, number>
  onChoose: (view: View) => void
}) {
  const views: { value: View; label: string }[] = [
    { value: 'all', label: m.programs_filter_all() },
    { value: 'drafts', label: m.programs_filter_drafts() },
    { value: 'review', label: m.programs_filter_review() },
  ]
  return (
    <QuickViews
      label={m.programs_filter_label()}
      views={views.map(option => ({ ...option, count: counts[option.value] }))}
      value={view}
      onChoose={onChoose}
    />
  )
}

/** Nothing in the period: the next programmes are not created yet, or they lie further ahead. */
function NoneInPeriod({
  period,
  preset,
  canCreate,
}: {
  period: ListPeriod
  preset: PeriodPreset | null
  canCreate: boolean
}) {
  return (
    <EmptyState
      icon={CalendarDays}
      title={m.programs_none_in_period_title({ from: formatDay(period.from), to: formatDay(period.to) })}
      description={m.programs_none_in_period_description()}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {canCreate && <CreateButton />}
          {preset !== '3-months' && (
            <Button asChild variant="outline" size="sm">
              <Link to="?period=3-months" preventScrollReset>
                {m.list_period_show_3_months()}
              </Link>
            </Button>
          )}
        </div>
      }
    />
  )
}

/** A filter that leaves nothing: no draft, or nothing to review. */
function NothingShown({ view }: { view: View }) {
  return (
    <Panel padded>
      <div className="flex flex-col items-start gap-1.5 py-2">
        <Status tone="success">
          {view === 'drafts' ? m.programs_no_drafts_title() : m.programs_nothing_to_review_title()}
        </Status>
        <p className="text-muted-foreground text-sm">
          {view === 'drafts' ? m.programs_no_drafts_description() : m.programs_nothing_to_review_description()}
        </p>
      </div>
    </Panel>
  )
}
