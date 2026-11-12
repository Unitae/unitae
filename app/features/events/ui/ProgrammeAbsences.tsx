import { Panel, Status } from '@unitae/ui'
import { CalendarOff } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'

import type { ListPeriod, PeriodPreset } from '~/features/events/model/list-period'
import type { ProgrammeAbsence } from '~/features/events/model/programme-absence.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { ListToolbar } from '~/shared/ui/ListToolbar'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import { AbsenceWeekList } from './AbsenceWeekList'
import { formatDay } from './PeriodMenu'
import { matchesName, periodWeeks, weekOf } from './period-weeks'
import { WeeksHint } from './WeeksHint'

interface ProgrammeAbsencesProps {
  absences: ProgrammeAbsence[]
  period: ListPeriod
  preset: PeriodPreset | null
  /** Whether anyone has ever declared an absence. */
  hasAnyAbsence: boolean
  timeZone: string
  now: Date
}

/**
 * Who is away, week by week, over the period: a name search and « À revoir » narrow the list in the page, and each
 * empty list says why it is empty.
 */
export function ProgrammeAbsences({ absences, period, preset, hasAnyAbsence, timeZone, now }: ProgrammeAbsencesProps) {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const review = params.get('view') === 'review'
  const matching = absences.filter(absence => matchesName(absence.name, query))
  const toReview = matching.filter(absence => absence.conflicts.length > 0)
  const shown = review ? toReview : matching
  const setParam = (name: string, value: string | null) =>
    setParams(
      prev => {
        if (value == null) prev.delete(name)
        else prev.set(name, value)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  if (!hasAnyAbsence) {
    return (
      <EmptyState
        icon={CalendarOff}
        title={m.programs_absences_empty_title()}
        description={m.programs_absences_empty_description()}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        search={<SearchInput paramName="q" placeholder={m.programs_absences_search_placeholder()} />}
        views={
          <QuickViews
            label={m.programs_absences_filter_label()}
            views={[
              { value: 'all', label: m.programs_absences_filter_all(), count: matching.length },
              { value: 'review', label: m.programs_absences_filter_review(), count: toReview.length },
            ]}
            value={review ? 'review' : 'all'}
            onChoose={view => setParam('view', view === 'review' ? 'review' : null)}
          />
        }
        sort={<WeeksHint />}
      />

      {absences.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title={m.programs_absences_none_in_period_title({ from: formatDay(period.from), to: formatDay(period.to) })}
          description={m.programs_absences_none_in_period_description()}
          action={
            preset === '3-months' ? undefined : (
              <Button asChild variant="outline" size="sm">
                <Link to="?period=3-months" preventScrollReset>
                  {m.list_period_show_3_months()}
                </Link>
              </Button>
            )
          }
        />
      ) : shown.length === 0 && query.trim() !== '' ? (
        <EmptyState
          title={m.programs_absences_no_match_title({ query: query.trim() })}
          description={m.programs_absences_no_match_description()}
          action={
            <Button variant="outline" size="sm" onClick={() => setParam('q', null)}>
              {m.programs_absences_clear_search()}
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <Panel padded>
          <div className="flex flex-col items-start gap-1.5 py-2">
            <Status tone="success">{m.programs_absences_nothing_to_review_title()}</Status>
            <p className="text-muted-foreground text-sm">{m.programs_absences_nothing_to_review_description()}</p>
          </div>
        </Panel>
      ) : (
        <AbsenceWeekList
          weeks={periodWeeks(shown, period, timeZone)}
          showEmptyWeeks={!review && query.trim() === ''}
          currentWeek={weekOf(now, timeZone)}
          timeZone={timeZone}
          now={now}
        />
      )}
    </div>
  )
}
