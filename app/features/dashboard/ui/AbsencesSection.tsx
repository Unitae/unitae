import { CalendarOff, Info, Plus } from 'lucide-react'
import { Link } from 'react-router'

import type { getUpcomingAbsences } from '~/features/dashboard/server/dashboard.server'
import { DashboardSection, PanelEmpty, PanelError, panelLinkRowClass } from '~/features/dashboard/ui/DashboardSection'
import { formatShortDate } from '~/features/dashboard/ui/dashboard-format'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

type Absences = Awaited<ReturnType<typeof getUpcomingAbsences>>['upcoming']

/** The viewer's planned absences, with a nudge when the next two months look empty. */
export function AbsencesSection({
  absences,
  shouldNudge,
  timeZone,
}: {
  absences: Absences | null
  shouldNudge: boolean
  timeZone: string
}) {
  const hasItems = absences != null && absences.length > 0
  return (
    <DashboardSection
      title={m.dashboard_my_absences()}
      link={hasItems ? { to: '/me/days-off', label: m.dashboard_absences_link() } : undefined}
      actions={
        <Button variant="ghost" size="icon-xs" asChild>
          <Link to="/me/days-off/new">
            <Plus className="size-4" />
            <span className="sr-only">{m.dashboard_plan_absence()}</span>
          </Link>
        </Button>
      }
    >
      {absences == null ? (
        <PanelError />
      ) : (
        <>
          {shouldNudge && (
            <p className="flex items-start gap-2.5 border-border border-b bg-brand-soft px-3.5 py-2.5 text-sm last:border-b-0">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-text" />
              {m.dashboard_absence_nudge()}
            </p>
          )}
          {absences.length === 0
            ? !shouldNudge && (
                <PanelEmpty
                  icon={CalendarOff}
                  title={m.dashboard_no_absences()}
                  action={
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/me/days-off/new">{m.dashboard_plan_absence()}</Link>
                    </Button>
                  }
                />
              )
            : absences.map(a => (
                <Link key={a.id} to="/me/days-off" className={panelLinkRowClass}>
                  <CalendarOff aria-hidden="true" className="size-4 shrink-0 text-faint" />
                  <span className="text-sm tabular-nums">
                    {formatShortDate(a.startDate, timeZone)} — {formatShortDate(a.endDate, timeZone)}
                  </span>
                </Link>
              ))}
        </>
      )}
    </DashboardSection>
  )
}
