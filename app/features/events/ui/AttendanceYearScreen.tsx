import { PeriodStepper, SidePanel } from '@unitae/ui'
import { Eye } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { AttendanceEntry, AttendanceViewer } from '~/features/events/model/attendance-entry'
import {
  type AttendanceView,
  attendanceMonths,
  type OverviewMeeting,
} from '~/features/events/model/attendance-overview'
import { AttendanceMeetingList, monthKey } from '~/features/events/ui/AttendanceMeetingList'
import { AttendanceOverview } from '~/features/events/ui/AttendanceOverview'
import { AttendancePanel } from '~/features/events/ui/AttendancePanel'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { ListWithPanel, sidePanelWalk } from '~/shared/ui/ListWithPanel'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'

export type YearMeeting = OverviewMeeting & AttendanceEntry

interface AttendanceYearScreenProps {
  meetings: YearMeeting[]
  previous: OverviewMeeting[]
  serviceYear: number
  currentServiceYear: number
  today: string
  now: Date
  viewer: Omit<AttendanceViewer, 'now'>
  /** Some template counts its attendance; without one the page says how to start. */
  counting: boolean
  canManageTemplates: boolean
}

const yearLabel = (serviceYear: number) => `${serviceYear}–${serviceYear + 1}`

/** The earliest service year the address accepts (the route's own bound). */
const FIRST_SERVICE_YEAR = 2000

/**
 * The attendance page for whoever may read it: the service year's figures, its meetings by month, and one meeting's
 * counts beside the list — editable for whoever may change them.
 */
export function AttendanceYearScreen(props: AttendanceYearScreenProps) {
  const { meetings, previous, serviceYear, currentServiceYear, today, now, counting } = props
  const timeZone = props.viewer.timeZone
  const viewer = { ...props.viewer, now }
  const [view, setView] = useState<AttendanceView>('all')
  const months = attendanceMonths({ meetings, now, timeZone, view })
  // The month under way open, the past ones folded. The route keys this screen by year: another year starts afresh.
  const [open, setOpen] = useState<Set<string>>(() => new Set(months[0] ? [monthKey(months[0])] : []))
  const toggle = (key: string) =>
    setOpen(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const toComplete = attendanceMonths({ meetings, now, timeZone, view: 'todo' }).reduce(
    (total, month) => total + month.rows.length,
    0,
  )
  const panel = useSideEditor<'meeting'>(target => meetings.some(meeting => meeting.eventId === target.id))
  const selected = panel.target ? meetings.find(meeting => meeting.eventId === panel.target?.id) : undefined
  // ↑ ↓ walk the meetings the list shows, in its order: never into a folded month.
  const order = months
    .filter(month => view !== 'all' || open.has(monthKey(month)))
    .flatMap(month => month.rows.flatMap(row => (row.type === 'meeting' ? [row.eventId] : [])))
  const walk = panel.walk('meeting', order)
  const locale = getLocale()
  const when = (meeting: YearMeeting) =>
    `${formatEventDate(meeting.startDate, timeZone, locale, { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatEventTime(meeting.startDate, timeZone, locale)}`

  const header = (
    <PageHeader
      title={m.attendance_page_title()}
      breadcrumbs={[{ label: m.attendance_page_title() }]}
      controls={
        <PeriodStepper
          label={m.attendance_year({ label: yearLabel(serviceYear) })}
          previous={{
            label: m.attendance_year_previous(),
            href: `?year=${serviceYear - 1}`,
            disabled: serviceYear <= FIRST_SERVICE_YEAR,
          }}
          next={{
            label: m.attendance_year_next(),
            href: `?year=${serviceYear + 1}`,
            disabled: serviceYear >= currentServiceYear,
          }}
          renderLink={({ href, ...rest }) => <Link to={href} {...rest} />}
          labelWidth={200}
        />
      }
    />
  )

  if (!counting) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <EmptyState
          icon={Eye}
          title={m.attendance_empty_title()}
          description={m.attendance_empty_body()}
          action={
            props.canManageTemplates ? (
              <Button asChild variant="outline">
                <Link to="/settings/templates">{m.attendance_empty_action()}</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      <AttendanceOverview
        meetings={meetings}
        previous={previous}
        serviceYear={serviceYear}
        today={today}
        now={now}
        timeZone={timeZone}
      />
      <ListWithPanel
        onPanelKeyDown={walk?.onKeyDown}
        panel={
          panel.docked &&
          selected && (
            <AttendancePanel
              key={selected.eventId}
              entry={selected}
              viewer={viewer}
              formRef={panel.formRef}
              frame={(body, footer) => (
                <SidePanel
                  title={selected.name}
                  description={when(selected)}
                  closeLabel={m.common_close()}
                  onClose={() => panel.request(null)}
                  returnFocus={panel.target?.trigger}
                  footer={footer}
                  walk={sidePanelWalk(walk, {
                    previous: m.attendance_panel_previous(),
                    next: m.attendance_panel_next(),
                  })}
                >
                  {body}
                </SidePanel>
              )}
            />
          )
        }
      >
        <AttendanceMeetingList
          months={months}
          view={view}
          onViewChange={setView}
          toComplete={toComplete}
          selectedId={selected?.eventId ?? null}
          onSelect={(meeting, trigger) => panel.request({ kind: 'meeting', id: meeting.eventId, trigger })}
          timeZone={timeZone}
          open={open}
          onToggle={toggle}
          canComplete={props.viewer.canCorrect}
        />
      </ListWithPanel>
      <DiscardChangesDialog
        {...panel.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
      {!panel.docked && (
        <Sheet open={selected != null} onOpenChange={next => !next && panel.close()}>
          <SheetContent className="sm:max-w-md">
            {selected && (
              <>
                <SheetHeader>
                  <SheetTitle>{selected.name}</SheetTitle>
                  <SheetDescription>{when(selected)}</SheetDescription>
                </SheetHeader>
                <AttendancePanel
                  key={selected.eventId}
                  entry={selected}
                  viewer={viewer}
                  frame={(body, footer) => (
                    <div className="flex flex-col gap-4 px-4 pb-4">
                      {body}
                      {footer && <div className="flex justify-end">{footer}</div>}
                    </div>
                  )}
                />
              </>
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
